/**
 * @license
 * Copyright 2020 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type * as stream from 'stream';
import * as resourceBundle from '@balena/resource-bundle';
import * as semver from 'balena-semver';
import type * as SDK from 'balena-sdk';

interface ApplyOptions {
	application: number;
	sdk: SDK.BalenaSDK;
	stream: stream.Readable;
	version?: string;
}

export interface Release {
	semver: string;
	status: SDK.ReleaseStatus;
	releaseImages: Array<{
		image: SDK.Image;
		service: string;
	}>;
	releaseTags: Array<Pick<SDK.ReleaseTag, 'tag_key' | 'value'>>;
}

export function $normalizeManifest(
	manifest: SDK.Release,
	version?: string,
): Release {
	const release: Release = {
		semver: manifest.semver,
		status: manifest.status,
		releaseImages: [],
		releaseTags: [],
	};

	if (typeof version === 'string') {
		const versionOverride = semver.parse(version);
		if (versionOverride != null) {
			release.semver = version;
		} else {
			throw new Error(
				`Expected version to be a valid semantic version but found '${version}'`,
			);
		}
		// TODO: handle invalid semver input, if versionOverride is null
	}

	if (release.status !== 'success') {
		throw new Error(
			`Expected release to have status 'success' but found '${manifest.status}'`,
		);
	}
	if (typeof release.semver !== 'string') {
		throw new Error(
			`Expected release to have semver that is a string but found ${typeof manifest.semver}`,
		);
	}
	if (semver.valid(release.semver) == null) {
		throw new Error(
			`Expected release to have semver to be a valid semantic version but found '${release.semver}'`,
		);
	}

	// Validate release images
	if (!Array.isArray(manifest.release_image)) {
		throw new Error(
			`Expected array of release images but found ${typeof manifest.release_image}`,
		);
	}
	for (const releaseImage of manifest.release_image) {
		if (!Array.isArray(releaseImage.image)) {
			throw new Error(
				`Expected array of images in release image ${releaseImage.id} but found ${typeof releaseImage.image}`,
			);
		}
		const [image] = releaseImage.image;
		if (image.status !== 'success') {
			throw new Error(
				`Expected release image to have status 'success' but found ${image.status}`,
			);
		}
		if (typeof image.content_hash !== 'string') {
			throw new Error(
				`Expected content hash for release image to be a string but found ${image.content_hash}`,
			);
		}
		if (!Array.isArray(image.is_a_build_of__service)) {
			throw new Error(
				`Expected array of services in release image but found ${typeof image.is_a_build_of__service}`,
			);
		}
		const [service] = image.is_a_build_of__service;
		release.releaseImages.push({
			image: image,
			service: service.service_name,
		});
	}
	// TODO: Validate release tags
	if (!Array.isArray(manifest.release_tag)) {
		throw new Error(
			`Expected array of release tags but found ${typeof manifest.release_tag}`,
		);
	}
	for (const releaseTag of manifest.release_tag) {
		if (typeof releaseTag.tag_key !== 'string') {
			throw new Error(
				`Expected key of release tag ${releaseTag.id} to be a string but found ${releaseTag.tag_key}`,
			);
		}
		if (typeof releaseTag.value !== 'string') {
			throw new Error(
				`Expected value of release tag ${releaseTag.id} to be a string but found ${releaseTag.value}`,
			);
		}
		release.releaseTags.push({
			tag_key: releaseTag.tag_key,
			value: releaseTag.value,
		});
	}

	return release;
}

export async function apply(options: ApplyOptions): Promise<number> {
	const { sdk } = options;
	// FIXME: clone release timestamps when the API already allows it
	const currentDateIso = new Date(Date.now()).toISOString();

	const bundle = await resourceBundle.read<SDK.Release>(
		options.stream,
		'io.balena.release',
	);

	// TODO: validate if manifest version is compatible with SDK

	let release: Release;
	try {
		release = $normalizeManifest(bundle.manifest, options.version);
	} catch (error) {
		throw new Error(`Manifest is malformed: ${error.message}`);
	}

	// This validates that the application exists
	// throws an error if it does not
	const application = await sdk.models.application.get(options.application, {
		$select: ['id'],
	});

	const [existingRelease] = await sdk.pine.get<SDK.Release>({
		resource: 'release',
		options: {
			$select: ['id', 'commit', 'version'],
			$filter: {
				$or: [
					{
						belongs_to__application: application.id,
						semver: release.semver,
						status: 'success',
					},
					{
						belongs_to__application: application.id,
						commit: bundle.manifest.commit,
						status: 'success',
					},
				],
			},
			$top: 1,
		},
	});

	if (existingRelease != null) {
		throw new Error(
			`A successful release with the commit ${existingRelease.commit} and version ${existingRelease.version.version} already exists. Duplicates are not allowed.`,
		);
	}

	const localRelease = await sdk.pine.post<SDK.Release>({
		resource: 'release',
		body: {
			belongs_to__application: application.id,
			created_at: bundle.manifest.created_at,
			commit: bundle.manifest.commit,
			composition: bundle.manifest.composition,
			contract: bundle.manifest.contract,
			status: 'running',
			source: bundle.manifest.source,
			build_log: bundle.manifest.build_log,
			is_invalidated: bundle.manifest.is_invalidated,
			start_timestamp: currentDateIso,
			end_timestamp: currentDateIso,
			update_timestamp: currentDateIso,
			phase: bundle.manifest.phase,
			semver: release.semver,
			variant: bundle.manifest.variant,
			known_issue_list: bundle.manifest.known_issue_list,
			is_final: bundle.manifest.is_final,
			is_finalized_at__date: bundle.manifest.is_finalized_at__date,
			note: bundle.manifest.note,
			invalidation_reason: bundle.manifest.invalidation_reason,
		},
	});

	// create release tags
	if (bundle.manifest.release_tag) {
		await Promise.all(
			release.releaseTags.map(async (rt: SDK.ReleaseTag) => {
				await sdk.pine.post({
					resource: 'release_tag',
					body: {
						release: localRelease.id,
						tag_key: rt.tag_key,
						value: rt.value,
					},
				});
			}),
		);
	}

	// create associated image entries and upload the images.
	// entries need to be created as "pending" first so that the api
	// the api can generate an image name that will use to upload the
	// artifacts to the registry. then we begin upload, and finally
	// mark the image entries as "success"-ful.
	for (const releaseImage of release.releaseImages) {
		const localService = await sdk.pine.getOrCreate<SDK.Service>({
			resource: 'service',
			id: {
				application: application.id,
				service_name: releaseImage.service,
			},
			body: {
				application: application.id,
				service_name: releaseImage.service,
			},
		});

		// There is a restriction in the API that requires images to be created
		// with the current date.
		const localImage = await sdk.pine.post<SDK.Image>({
			resource: 'image',
			body: {
				content_hash: releaseImage.image.content_hash,
				is_a_build_of__service: localService.id,
				status: 'running',
				// TODO: set timestamps to manifest values once API allows setting of custom timestamps
				start_timestamp: currentDateIso,
				push_timestamp: currentDateIso,
			},
		});

		await sdk.pine.post({
			resource: 'image__is_part_of__release',
			body: {
				is_part_of__release: localRelease.id,
				image: localImage.id,
			},
		});

		// TODO: upload images from the release bundle at this part

		// mark image as successful
		await sdk.pine.patch({
			resource: 'image',
			id: localImage.id,
			body: {
				status: releaseImage.image.status,
				// TODO: set timestamps to manifest values once API allows setting of custom timestamps
				end_timestamp: currentDateIso,
			},
		});
	}

	await sdk.pine.patch({
		resource: 'release',
		id: localRelease.id,
		body: {
			status: release.status,
			// TODO: set timestamps to manifest values once API allows setting of custom timestamps
			end_timestamp: currentDateIso,
			update_timestamp: currentDateIso,
		},
	});

	return localRelease.id;
}
