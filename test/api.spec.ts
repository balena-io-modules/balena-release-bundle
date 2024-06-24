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
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as fs from 'fs/promises';
import * as nock from 'nock';
import * as resourceBundle from '@balena/resource-bundle';
import mockResponses from './mocks';
import * as path from 'path';
import * as SDK from 'balena-sdk';

chai.use(chaiAsPromised);
const expect = chai.expect;
before(function () {
	nock.disableNetConnect();
});

beforeEach(async function () {
	const mockFile = `${this.currentTest?.title?.replace(/ /g, '-').toLowerCase()}.json`;
	if (process.env.UPDATE_MOCKS === 'true') {
		nock.recorder.rec({
			dont_print: true,
			output_objects: true,
		});
	}
	await mockResponses(mockFile);
});

afterEach(async function () {
	const mockFile = `${this.currentTest?.title?.replace(/ /g, '-').toLowerCase()}.json`;
	if (process.env.UPDATE_MOCKS === 'true') {
		await fs.writeFile(
			path.resolve(__dirname, 'mocks', mockFile),
			JSON.stringify(nock.recorder.play(), null, 2),
		);
	}
	nock.cleanAll();
});

after(function () {
	nock.enableNetConnect();
});

describe('Basic create release usage', function () {
	it('Should create a release bundle using the release ID', async function () {
		// amd64-supervisor https://dashboard.balena-cloud.com/apps/1667442/releases/3023927
		const mockFile = `${this.test?.title.replace(/ /g, '-').toLowerCase()}.json`;
		const nocksDefinitionsFile = await fs.readFile(
			path.resolve(__dirname, 'mocks', mockFile),
			'utf8',
		);
		const expectedManifest = JSON.parse(nocksDefinitionsFile)[0].response
			.d[0] as SDK.Release;
		const releaseId = process.env.RELEASE_ID
			? Number(process.env.RELEASE_ID)
			: expectedManifest.id;
		const sdk = SDK.getSdk();
		const releaseBundle = await bundle.create({
			sdk,
			releaseId,
		});
		if (process.env.UPDATE_MOCKS === 'true') {
			await pipeline(
				releaseBundle,
				createWriteStream('test/fixtures/release-bundle.tar'),
			);
		} else {
			const readableBundle = await resourceBundle.read<SDK.Release>(
				releaseBundle,
				'io.balena.release',
			);
			expect(readableBundle.manifest).to.deep.equal(expectedManifest);
		}
	});

	it('Should fail to create a release bundle using a non-existing release ID', async function () {
		// amd64-supervisor https://dashboard.balena-cloud.com/apps/1667442/releases/3023927
		const sdk = SDK.getSdk();
		if (process.env.UPDATE_MOCKS === 'true') {
			await bundle.create({
				sdk,
				releaseId: 3023927,
			});
		} else {
			await expect(
				bundle.create({
					sdk,
					releaseId: 3023927,
				}),
			).to.be.rejectedWith(Error, 'Release not found.');
		}
	});
});

describe('Basic apply release usage', function () {
	it('Should apply the release bundle to a fleet', async function () {
		const mockFile = `${this.test?.title.replace(/ /g, '-').toLowerCase()}.json`;
		const nocksDefinitionsFile = await fs.readFile(
			path.resolve(__dirname, 'mocks', mockFile),
			'utf8',
		);
		const expectedApplication = JSON.parse(nocksDefinitionsFile)[0].response
			.d[0] as SDK.Application;
		const sdk = SDK.getSdk();
		const bundleStream = createReadStream('./test/fixtures/release-bundle.tar');
		await bundle.apply({
			sdk,
			application: process.env.APPLICATION_ID
				? Number(process.env.APPLICATION_ID)
				: expectedApplication.id,
			stream: bundleStream,
		});
	});

	it('Should fail in applying the release bundle to a fleet with existing successful release', async function () {
		const mockFile = `${this.test?.title.replace(/ /g, '-').toLowerCase()}.json`;
		const nocksDefinitionsFile = await fs.readFile(
			path.resolve(__dirname, 'mocks', mockFile),
			'utf8',
		);
		const expectedApplication = JSON.parse(nocksDefinitionsFile)[0].response
			.d[0] as SDK.Release;
		const sdk = SDK.getSdk();
		const bundleStream = createReadStream('./test/fixtures/release-bundle.tar');
		await expect(
			bundle.apply({
				sdk,
				application: process.env.APPLICATION_ID
					? Number(process.env.APPLICATION_ID)
					: expectedApplication.id,
				stream: bundleStream,
			}),
		).to.be.rejectedWith(
			Error,
			'A successful release with the version 16.3.11 already exists and duplicates are not allowed.',
		);
	});
});
