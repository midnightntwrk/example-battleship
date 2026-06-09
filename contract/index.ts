// This file is part of example-battleship.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// This files main purpose is to export the compiled contract
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
    Contract,
    ledger,
    pureCircuits,
    type Witnesses,
    type Ledger,
    type ImpureCircuits,
    type PureCircuits
} from './managed/battleship/contract/index.js';
import { Contract } from './managed/battleship/contract/index.js';
import { witnesses } from './witnesses.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'battleship');

export const CompiledBattleshipContract = CompiledContract.make(
    'BattleshipContract',
    Contract,
).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
)