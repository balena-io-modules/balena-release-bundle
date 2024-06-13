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

import { v4 as uuidv4 } from 'uuid';
import type * as stream from 'stream';
import type { ReleaseManifest } from './types';
import * as resourceBundle from '@balena/resource-bundle';
import * as SDK from 'balena-sdk';

interface ReadOptions {
	apiUrl: string;
	application: number;
	authToken: string;
	stream: stream.Readable;
	force?: boolean;
}

function generateUniqueKey() {
	return uuidv4().replace(/-/g, '');
}

async function backfillLowerRevisions(
	sdk: SDK.BalenaSDK,
	application: number,
	currentDateIso: string,
	manifest: ReleaseManifest,
): Promise<void> {
	const [highestSameSemverLocalReleases] = await sdk.pine.get({
		resource: 'release',
		options: {
			$top: 1,
			$select: ['id', 'revision'],
			$filter: {
				belongs_to__application: application,
				semver_major: manifest.semver_major,
				semver_minor: manifest.semver_minor,
				semver_patch: manifest.semver_patch,
				revision: { $ne: null },
			},
			$orderby: 'revision desc',
		},
	});

	const version = `${manifest.semver_major}.${manifest.semver_minor}.${manifest.semver_patch}`;
	for (
		//
		let revision =
			highestSameSemverLocalReleases == null
				? 0
				: // we have already $filtered for this so ! is fine
					highestSameSemverLocalReleases.revision! + 1;
		revision < (manifest.revision ? manifest.revision : 0);
		revision++
	) {
		await sdk.pine.post({
			resource: 'release',
			body: {
				belongs_to__application: application,
				status: 'failed',
				start_timestamp: currentDateIso,
				end_timestamp: currentDateIso,
				update_timestamp: currentDateIso,
				source: manifest.source,
				composition: manifest.composition,
				commit: generateUniqueKey(),
				contract: manifest.contract,
				semver: revision === 0 ? version : `${version}+rev${revision}`,
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

export async function apply(options: ReadOptions): Promise<number> {
	// FIXME: clone release timestamps when the API already allows it
	const currentDateIso = new Date(Date.now()).toISOString();

	const bundle = await resourceBundle.read<ReleaseManifest>(
		options.stream,
		'io.balena.release',
	);

	const sdk = SDK.getSdk({
		apiUrl: options.apiUrl,
		dataDirectory: false,
	});
	await sdk.auth.loginWithToken(options.authToken);

	// TODO: validate manifest
	// Check if a release with the same version and revision exists
	const [existingRelease] = await sdk.pine.get({
		resource: 'release',
		options: {
			$select: [
				'id',
				'is_final',
				'is_invalidated',
				'revision',
				'semver',
				'status',
				'version',
			],
			$filter: {
				belongs_to__application: options.application,
				semver: bundle.manifest.semver,
				revision: bundle.manifest.revision,
			},
		},
	});

	if (existingRelease) {
		if (!options.force) {
			throw new Error(
				'An application release with the same version already exists.',
			);
		}
		// Remove images mapped to a release
		// when the following conditions about the release is true
		// - the release is is_final is false and/or is_invalidated is true
		// - force flag is set to true
		type ReleaseImageMap = {
			id: number;
			created_at: string;
			image: {
				__id: number;
			};
			is_part_of__release: {
				__id: number;
			};
		};
		const releaseImageMappings = (await sdk.pine.get({
			resource: 'image__is_part_of__release',
			options: {
				$filter: {
					is_part_of__release: existingRelease.id,
				},
			},
		})) as unknown as ReleaseImageMap[];

		await Promise.all(
			releaseImageMappings.map(async (releaseImageMap) => {
				await sdk.pine.delete({
					resource: 'image__is_part_of__release',
					id: releaseImageMap.id,
				});
			}),
		);

		// TODO: Delete images tied to the old release
		// TODO: Remove release tags of old release
	}

	// Backfill lower releases to workaround the balena API constraint
	// that a particular release revision may only be created if
	// lower revisions exist
	// TODO: Remove backfilling once balena API constraint is removed
	if (bundle.manifest.revision != null) {
		await backfillLowerRevisions(
			sdk,
			options.application,
			currentDateIso,
			bundle.manifest,
		);
	}

	const localRelease = await sdk.pine.post<SDK.Release>({
		resource: 'release',
		body: {
			belongs_to__application: options.application,
			created_at: bundle.manifest.created_at,
			commit: bundle.manifest.commit,
			composition: bundle.manifest.composition,
			contract: bundle.manifest.contract,
			status: 'running',
			source: bundle.manifest.source,
			build_log: bundle.manifest.build_log,
			is_invalidated: bundle.manifest.is_invalidated,
			// TODO: set timestamps to manifest values once API allows setting of custom timestamps
			start_timestamp: currentDateIso,
			end_timestamp: currentDateIso,
			update_timestamp: currentDateIso,
			phase: bundle.manifest.phase,
			semver: bundle.manifest.semver,
			semver_major: bundle.manifest.semver_major,
			semver_minor: bundle.manifest.semver_minor,
			semver_patch: bundle.manifest.semver_patch,
			semver_prerelease: bundle.manifest.semver_prerelease,
			semver_build: bundle.manifest.semver_build,
			variant: bundle.manifest.variant,
			revision: bundle.manifest.revision,
			known_issue_list: bundle.manifest.known_issue_list,
			raw_version: bundle.manifest.raw_version,
			is_final: bundle.manifest.is_final,
			is_finalized_at__date: bundle.manifest.is_finalized_at__date,
			note: bundle.manifest.note,
			invalidation_reason: bundle.manifest.invalidation_reason,
		},
	});

	// create release tags
	if (bundle.manifest.release_tag) {
		await Promise.all(
			bundle.manifest.release_tag.map(async (rt: { [index: string]: any }) => {
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
	for (const remoteImage of bundle.manifest.release_image!) {
		const localService: any = await sdk.pine.getOrCreate({
			resource: 'service',
			id: {
				application: options.application,
				service_name:
					remoteImage.image[0].is_a_build_of__service[0].service_name,
			},
			body: {
				application: options.application,
				service_name:
					remoteImage.image[0].is_a_build_of__service[0].service_name,
			},
		});

		// There is a restriction in the API that requires images to be created
		// with the current date.
		const localImage: any = await sdk.pine.post({
			resource: 'image',
			body: {
				content_hash: remoteImage.image[0].content_hash,
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

		// Requesting for a token fails if API_TOKEN is not provided.
		// let additionalArguments: string[] = [];
		// if (await balenaCloudSdk.auth.isLoggedIn()) {
		// 	const remoteAuthResponse = await balenaCloudSdk.request.send({
		// 		baseUrl: await balenaCloudSdk.settings.get('apiUrl'),
		// 		url: '/auth/v1/token',
		// 		qs: {
		// 			service: remoteImage.registry,
		// 			scope: `repository:${remoteImage.repository}:pull`,
		// 		},
		// 	});
		// 	additionalArguments = [
		// 		'--src-registry-token',
		// 		remoteAuthResponse.body.token,
		// 	];
		// }

		// There is currently a bug in the SDK that does not return the correct API URL
		// so we can't use `await sdk.settings.get('apiUrl');`
		// const localRegistryUrl = await sdk.settings.get('registry2Url');
		// const localAuthResponse = await sdk.request.send({
		// 	baseUrl: await sdk.settings.get('apiUrl'),
		// 	url: '/auth/v1/token',
		// 	qs: {
		// 		service: localRegistryUrl,
		// 		scope: `repository:v2/${
		// 			localImage.is_stored_at__image_location.split('/v2/')[1]
		// 		}:pull,push`,
		// 	},
		// });
		// const result = await runCommand('skopeo', [
		// 	'copy',
		// 	'--override-os',
		// 	'linux',
		// 	...additionalArguments,
		// 	'--dest-registry-token',
		// 	localAuthResponse.body.token,
		// 	`docker://${remoteImage.image_name}@${remoteImage.content_hash}`,
		// 	`docker://${localRegistryUrl}/v2/${
		// 		localImage.is_stored_at__image_location.split('/v2/')[1]
		// 	}:latest`,
		// ]);
		// console.log(result);

		// mark image as successful
		await sdk.pine.patch({
			resource: 'image',
			id: localImage.id,
			body: {
				status: remoteImage.image[0].status,
				// TODO: set timestamps to manifest values once API allows setting of custom timestamps
				end_timestamp: currentDateIso,
			},
		});
	}

	await sdk.pine.patch({
		resource: 'release',
		id: localRelease.id,
		body: {
			status: bundle.manifest.status,
			// TODO: set timestamps to manifest values once API allows setting of custom timestamps
			end_timestamp: currentDateIso,
			update_timestamp: currentDateIso,
		},
	});

	return localRelease.id;
}
