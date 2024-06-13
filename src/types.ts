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

interface Dictionary<T> {
	[key: string]: T;
}

export interface ReleaseManifest {
	created_at: string;
	commit: string;
	composition: {
		[index: string]: any;
	} | null;
	contract: string | null;
	status:
		| 'cancelled'
		| 'error'
		| 'failed'
		| 'interrupted'
		| 'local'
		| 'running'
		| 'success'
		| 'timeout'
		| null;
	source: string;
	build_log: string | null;
	is_invalidated: boolean;
	start_timestamp: string;
	update_timestamp: string | null;
	end_timestamp: string | null;
	phase: 'next' | 'current' | 'sunset' | 'end-of-life' | null;
	semver: string;
	semver_major: number;
	semver_minor: number;
	semver_patch: number;
	semver_prerelease: string;
	semver_build: string;
	variant: string;
	revision: number | null;
	known_issue_list: string | null;
	raw_version: string;
	version: {
		raw: string;
		major: number;
		minor: number;
		patch: number;
		version: string;
		build: readonly string[];
		prerelease: ReadonlyArray<string | number>;
	};
	is_final: boolean;
	is_finalized_at__date: string | null;
	note: string | null;
	invalidation_reason: string | null;
	release_image?: Array<{
		id: number;
		created_at: string;
		end_timestamp: string;
		image: Array<{
			id: number;
			created_at: string;
			build_log: string;
			contract: {
				slug: string;
				type: string;
				name?: string;
				version?: string;
				externalVersion?: string;
				contractVersion?: string;
				description?: string;
				aliases?: string[];
				tags?: string[];
				data?: {
					[index: string]: any;
				} | null;

				assets?: {
					[index: string]: any;
				} | null;

				requires?: string[];
				provides?: string[];
				composedOf?: {
					[index: string]: any;
				} | null;
				partials?: Dictionary<string[] | Dictionary<string[]>>;
			} | null;
			content_hash?: string | null;
			project_type?: string | null;
			status: string;
			is_stored_at__image_location: string;
			start_timestamp?: string | null;
			end_timestamp?: string | null;
			push_timestamp?: string | null;
			image_size?: number | null;
			dockerfile: string;
			error_message?: string | null;
			is_a_build_of__service: Array<{
				service_name: string;
			}>;
		}>;
		is_part_of__release: any;
	}>;
	release_tag?: {
		[index: string]: any;
	} | null;
}
