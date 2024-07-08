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

import * as resourceBundle from '@balena/resource-bundle';
import type { Readable } from 'stream';
import type * as SDK from 'balena-sdk';

interface CreateOptions {
	sdk: SDK.BalenaSDK;
	releaseId: number;
	apiToken?: string;
}

export function $validateRelease(
	release: SDK.Release | undefined,
): SDK.Release {
	if (release == null) {
		throw new Error('Release not found.');
	}

	if (release.status !== 'success') {
		throw new Error(
			'Could not create bundle from release; release bundles can only be created from successful releases.',
		);
	}
	if (release.release_image == null) {
		throw new Error(
			'Release bundles can only be created from releases with successfully built images.',
		);
	}

	return release;
}

export async function create(options: CreateOptions): Promise<Readable> {
	const { sdk, releaseId } = options;
	const remoteRelease = await sdk.pine.get<SDK.Release>({
		resource: 'release',
		id: releaseId,
		options: {
			$expand: {
				release_tag: {
					$select: ['tag_key', 'value'],
				},
				release_image: {
					$select: ['created_at', 'image'],
					$expand: {
						image: {
							$select: [
								'created_at',
								'content_hash',
								'end_timestamp',
								'is_a_build_of__service',
								'is_stored_at__image_location',
								'push_timestamp',
								'status',
							],
							$expand: {
								is_a_build_of__service: { $select: ['id', 'service_name'] },
							},
						},
					},
				},
			},
		},
	});
	const release = $validateRelease(remoteRelease);

	const imageDescriptors = getImageDescriptors(release);
	const authinfo =
		await resourceBundle.docker.discoverAuthenticate(imageDescriptors);

	let token: string | undefined;
	if (authinfo != null) {
		const [authentication, scopes] = authinfo;
		const username = (await sdk.auth.getUserInfo()).username;
		// TODO: Authenticate using session token once resource bundle provides option
		if (options.apiToken) {
			token = await resourceBundle.docker.authenticate(authentication, scopes, {
				username,
				password: options.apiToken,
			});
		}
	}
	const { blobs } = await resourceBundle.docker.fetchImages(
		imageDescriptors,
		token,
	);

	return await $create(release, blobs);
}

function getImageDescriptors(
	release: SDK.Release,
): resourceBundle.docker.ImageDescriptor[] {
	return release.release_image!.map((releaseImage) => {
		if (!Array.isArray(releaseImage.image)) {
			throw new Error(
				'Release bundles can only be created from releases with successfully built images.',
			);
		}
		const [image] = releaseImage.image;
		const imageName = `${image.is_stored_at__image_location}@${image.content_hash}`;
		return resourceBundle.docker.parseImageName(imageName);
	});
}

async function $create(release: SDK.Release, blobs: resourceBundle.Resource[]) {
	const bundle = new resourceBundle.WritableBundle<SDK.Release>({
		type: 'io.balena.release',
		manifest: release,
	});
	for (const blob of blobs) {
		bundle.addResource(blob);
	}

	return bundle.finalize();
}
