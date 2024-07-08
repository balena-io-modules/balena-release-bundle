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

import { readFile } from 'fs/promises';
import * as path from 'path';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { describe } from 'mocha';
import type * as SDK from 'balena-sdk';
import * as bundle from '../src';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Basic create function usage', async function () {
	let releaseData: string;
	before(async function () {
		const releaseFile = path.resolve(__dirname, 'fixtures', 'release.json');
		releaseData = await readFile(releaseFile, 'utf8');
	});

	it('should allow creation of bundles from successful releases', function () {
		const release = JSON.parse(releaseData);
		const validatedRelease = bundle.$validateRelease(release);
		expect(validatedRelease).to.equal(release);
	});

	it('should throw an error if no release was found', function () {
		try {
			bundle.$validateRelease(undefined);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal('Release not found.');
		}
	});

	it('should throw an error if the release does not have a status equal to "success"', function () {
		try {
			const release = JSON.parse(releaseData) as SDK.Release;
			release.status = 'failed';
			bundle.$validateRelease(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				'Could not create bundle from release; release bundles can only be created from successful releases.',
			);
		}
	});

	it('should throw an error if the release does not include any images', function () {
		try {
			const release = JSON.parse(releaseData) as SDK.Release;
			release.release_image = undefined;
			bundle.$validateRelease(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				'Release bundles can only be created from releases with successfully built images.',
			);
		}
	});
});

describe('Basic apply release usage', async function () {
	let releaseData: string;
	before(async function () {
		const releaseFile = path.resolve(__dirname, 'fixtures', 'release.json');
		releaseData = await readFile(releaseFile, 'utf8');
	});

	it('Should be able to read the manifest and normalize it', function () {
		const release = JSON.parse(releaseData) as SDK.Release;
		const normalizedManifest = bundle.$normalizeManifest(release);
		expect(normalizedManifest.semver_major).to.equal(release.semver_major);
		expect(normalizedManifest.semver_minor).to.equal(release.semver_minor);
		expect(normalizedManifest.semver_patch).to.equal(release.semver_patch);
		expect(normalizedManifest.releaseImages).to.be.an('array');
		expect(normalizedManifest.releaseTags).to.be.an('array');
	});

	it('should throw an error if the release does not have a status equal to "success"', function () {
		const release = JSON.parse(releaseData) as SDK.Release;
		release.status = 'failed';
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected release to have status 'success' but found '${release.status}'`,
			);
		}
	});

	it('should throw an error if the major, minor, or patch version of the manifest is not a number', function () {
		let release = JSON.parse(releaseData) as SDK.Release;
		release.semver_major = 'test' as any;
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected release to have semver_major that is a number but found ${typeof release.semver_major}`,
			);
		}

		release = JSON.parse(releaseData) as SDK.Release;
		release.semver_minor = 'test' as any;
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected release to have semver_minor that is a number but found ${typeof release.semver_minor}`,
			);
		}

		release = JSON.parse(releaseData) as SDK.Release;
		release.semver_patch = 'test' as any;
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected release to have semver_patch that is a number but found ${typeof release.semver_patch}`,
			);
		}
	});

	it('should throw an error if the release does not include any images', function () {
		const release = JSON.parse(releaseData) as SDK.Release;
		release.release_image = undefined;
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected array of release images but found ${typeof release.release_image}`,
			);
		}
	});

	it('should throw an error if an image in the release does not have a status of "success"', function () {
		const release = JSON.parse(releaseData) as SDK.Release;
		if (!Array.isArray(release.release_image)) {
			throw new Error('Release manifest fixture is malformed.');
		}
		release.release_image[0].image[0].status = 'failed';
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected release image to have status 'success' but found ${release.release_image[0].image[0].status}`,
			);
		}
	});

	it('should throw an error if an image in the release does not have a content hash string', function () {
		const release = JSON.parse(releaseData) as SDK.Release;
		if (!Array.isArray(release.release_image)) {
			throw new Error('Release manifest fixture is malformed.');
		}
		release.release_image[0].image[0].content_hash = false as any;
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected content hash for release image to be a string but found ${release.release_image[0].image[0].content_hash}`,
			);
		}
	});

	it('should throw an error if an image in the release does not include service information', function () {
		const release = JSON.parse(releaseData) as SDK.Release;
		if (!Array.isArray(release.release_image)) {
			throw new Error('Release manifest fixture is malformed.');
		}
		release.release_image[0].image[0].is_a_build_of__service = null as any;
		try {
			bundle.$normalizeManifest(release);
			throw new Error(
				'Expected function to throw an error, but none was thrown',
			);
		} catch (err) {
			expect(err).to.be.an.instanceof(Error);
			expect(err.message).to.equal(
				`Expected array of services in release image but found ${typeof release.release_image[0].image[0].is_a_build_of__service}`,
			);
		}
	});
});
