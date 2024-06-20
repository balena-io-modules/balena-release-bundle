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
import * as SDK from 'balena-sdk';

// TODO: change parameters to accept the SDK instance instead
interface CreateOptions {
	apiUrl: string;
	authToken: string;
	releaseId: number;
}

export async function create(options: CreateOptions): Promise<Readable> {
	// TODO: pass the SDK instead
	const sdk = SDK.getSdk({
		apiUrl: options.apiUrl,
		dataDirectory: false,
	});
	await sdk.auth.loginWithToken(options.authToken);

	const remoteRelease = await sdk.pine.get<SDK.Release>({
		resource: 'release',
		id: options.releaseId,
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

	if (!remoteRelease) {
		throw new Error('Release not found.');
	}

	if (remoteRelease.status !== 'success') {
		throw new Error(
			'Could not create bundle from release; release bundles can only be created from successful releases.',
		);
	}

	const bundle = new resourceBundle.WritableBundle<SDK.Release>({
		type: 'io.balena.release',
		manifest: remoteRelease,
	});

	// TODO: Download the images of the release and include into the bundle

	return bundle.finalize();
}
