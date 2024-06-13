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

import * as bundle from '../src';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { describe } from 'mocha';
import * as stream from 'stream';
import * as fs from 'fs/promises';
import * as nock from 'nock';
import * as resourceBundle from '@balena/resource-bundle';
import type { ReleaseManifest } from '../src';
import authToken from './fixtures/authToken';
import mockResponses from './mocks';
// import * as path from 'path';
// import * as SDK from 'balena-sdk';

chai.use(chaiAsPromised);
const expect = chai.expect;

const apiUrl = 'https://api.balena-cloud.com';

describe('Basic create release usage', () => {
	before(async () => {
		nock.disableNetConnect();
	});

	after(async () => {
		nock.enableNetConnect();
	});

	it('Creates a release bundle using the release ID', async () => {
		// amd64-supervisor https://dashboard.balena-cloud.com/apps/1667442/releases/3023927
		await mockResponses('create.json');
		const releaseBundle = await bundle.create({
			apiUrl,
			authToken,
			releaseId: 3023927,
		});
		const readableBundle = await resourceBundle.read<ReleaseManifest>(
			releaseBundle,
			'io.balena.release',
		);
		const expectedManifestFile = await fs.readFile(
			'./test/mocks/create.json',
			'utf8',
		);
		const expectedManifest = JSON.parse(expectedManifestFile)[0].response.d[0];
		expect(readableBundle.manifest).to.deep.equal(expectedManifest);
	});
});

describe('Basic apply release usage', () => {
	before(async () => {
		nock.disableNetConnect();
	});

	after(async () => {
		nock.enableNetConnect();
	});

	it('Applies the release bundle to a fleet', async () => {
		await mockResponses('apply-release-bundle-to-fleet.json');
		const bundleBuffer = await fs.readFile(
			'./test/fixtures/release-bundle.tar',
		);
		const releaseBundleStream = new stream.Readable();
		releaseBundleStream.push(bundleBuffer);
		releaseBundleStream.push(null);
		await bundle.apply({
			apiUrl,
			authToken,
			application: 2136996,
			stream: releaseBundleStream,
			force: true,
		});
	});
});
