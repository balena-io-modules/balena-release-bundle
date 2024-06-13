# Release Bundle SDK

A *Release Bundle* is a resource bundle that contains application release metadata and image layers. 

## Installing

```
npm install --save @balena/release-bundle
```

## Usage

### Creating a Release Bundle from a Fleet Release

```
import * as fs from 'fs/promises';
import * as bundle from './src';
import * as SDK from 'balena-sdk';


async function run() {
    const sdk = SDK.getSdk();
    const apiUrl = await sdk.settings.get('apiUrl');
    const authToken = await sdk.auth.getToken();

    const releaseBundle = await bundle.create({
        apiUrl,
        authToken,
        releaseId: 3023927,
    });
    await fs.writeFile('./release-bundle.tar', releaseBundle);

}

run();

```

### Applying a Release Bundle to a Fleet

```
import * as fs from 'fs/promises';
import * as bundle from './src';
import * as SDK from 'balena-sdk';

async function run() {
    const sdk = SDK.getSdk();
    const apiUrl = await sdk.settings.get('apiUrl');
    const authToken = await sdk.auth.getToken();

    const bundleBuffer = await fs.readFile(
        './release-bundle.tar',
    );
    const bundleStream = new stream.Readable();
    bundleStream.push(bundleBuffer);
    bundleStream.push(null);

    await bundle.apply({
        apiUrl,
        authToken,
        application: 2136996,
        stream: bundleStream,
        force: true,
    });

}

run();

```


## License

This project is distributed under the Apache 2.0 license.

Copyright (c) 2024 Balena Ltd.