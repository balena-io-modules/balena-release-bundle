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

import * as _ from 'lodash';
import * as nock from 'nock';
import * as path from 'path';

export default async function mockResponses(fileName: string) {
	const nockDefinitions = nock.loadDefs(
		path.resolve(__dirname, fileName),
	) as nock.Definition[];
	nockDefinitions.forEach((definition) => {
		// Allow partial matching of request body
		nock(definition.scope)
			[
				definition.method!.toLowerCase()
			](definition.path, _.matches(definition.body))
			.reply(definition.status, definition.response);
		nock.define([definition]);
	});
}
