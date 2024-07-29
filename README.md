# Release Bundle SDK

A *Release Bundle* is a resource bundle that contains application release metadata and image layers. 

## Installing

```shell
npm install --save @balena/release-bundle
```

## Usage

### Creating a Release Bundle from a Fleet Release

```typescript
import { writeFile } from 'fs/promises';
import { create } from '@balena/release-bundle';
import { getSdk } from 'balena-sdk';


async function run() {
    const sdk = getSdk();

    const releaseBundle = await create({
        sdk,
        releaseId: 3023927,
    });
    await writeFile('./release-bundle.tar', releaseBundle);

}

run();

```

### Applying a Release Bundle to a Fleet

```typescript
import { createReadStream } from 'fs';
import { apply } from '@balena/release-bundle';
import { getSdk } from 'balena-sdk';

async function run() {
    const sdk = getSdk();

    const bundle = await createReadStream(
        './release-bundle.tar',
    );

    await apply({
        sdk,
        application: 2136996,
        stream: bundle,
    });

}

run();

```


## License

This project is distributed under the Apache 2.0 license.

Copyright (c) 2024 Balena Ltd.