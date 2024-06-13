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

import type { ReleaseManifest } from './types';
import * as resourceBundle from '@balena/resource-bundle';
import type { Readable } from 'stream';
import { getSdk } from 'balena-sdk';

interface CreateOptions {
	apiUrl: string;
	authToken: string;
	releaseId: number;
}

export async function create(options: CreateOptions): Promise<Readable> {
	const sdk = getSdk({
		apiUrl: options.apiUrl,
		dataDirectory: false,
	});
	await sdk.auth.loginWithToken(options.authToken);

	const remoteRelease = (await sdk.pine.get({
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
							],
							$expand: {
								is_a_build_of__service: { $select: ['id', 'service_name'] },
							},
						},
					},
				},
			},
		},
	})) as unknown as ReleaseManifest;

	if (!remoteRelease) {
		throw new Error('Release not found.');
	}

	const bundle = new resourceBundle.WritableBundle<ReleaseManifest>({
		type: 'io.balena.release',
		manifest: remoteRelease,
	});

	// TODO: Download the images of the release and include into the bundle

	return bundle.finalize();
}
