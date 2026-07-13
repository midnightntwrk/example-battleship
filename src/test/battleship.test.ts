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


/**
 * This test suite aims to demonstrate interaction with
 * the contract through midnight-js more than as a comprehensive test suite. 
 * Some test cases may not be present.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { submitCallTx, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type EnvironmentConfiguration, waitForFunds } from '@midnight-ntwrk/testkit-js';
import { getConfig } from '../config.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from '../wallet.js';
import { buildProviders, type BattleshipProviders } from '../providers.js';
import {
    CompiledBattleshipContract,
    ledger,
    zkConfigPath,
} from '../../contract/index.js';
import { 
    BoardState, 
    ShotState, 
    WinState,
    TurnState,
    Contract
} from '../../contract/managed/battleship/contract/index.js';
import { createBattlePrivateState } from '../../contract/witnesses.js';
import type { FinalizedCallTxData } from '@midnight-ntwrk/midnight-js-contracts';

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

type Role = 'ALICE' | 'BOB';

// Genesis seeds for the local dev node — pre-funded, used only on `local`.
const LOCAL_SEEDS: Record<Role, string> = {
    ALICE: '0000000000000000000000000000000000000000000000000000000000000001',
    BOB:   '0000000000000000000000000000000000000000000000000000000000000002',
};

function resolveSecret(net: string, role: Role): WalletSecret {
    if (net === 'local') return { kind: 'seed', value: LOCAL_SEEDS[role] };

    const upper = net.toUpperCase();
    const mnemonicEnv = `MIDNIGHT_${upper}_${role}_MNEMONIC`;
    const seedEnv = `MIDNIGHT_${upper}_${role}_SEED`;
    const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
    const seedHex = process.env[seedEnv]?.trim();

    if (mnemonic && seedHex) {
        throw new Error(
            `Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`,
        );
    }
    if (mnemonic) {
        return { kind: 'mnemonic', value: mnemonic };
    }
    if (seedHex) {
        if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
            throw new Error(
                `${seedEnv} must be a hex string of even length (no 0x prefix).`,
            );
        }
        return { kind: 'seed', value: seedHex };
    }
    throw new Error(
        `Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'. ` +
            `Set one in .env.${net} or the shell.`,
    );
}

const ALICE_PRIVATE_ID = 'alicePrivateState';
const BOB_PRIVATE_ID = 'bobPrivateState';

const logger = pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

describe(`Battleship Smart Contract via midnight-js (${network})`, () => {
    let aliceWallet: MidnightWalletProvider;
    let bobWallet: MidnightWalletProvider;
    let aliceProviders: BattleshipProviders;
    let bobProviders: BattleshipProviders;
    let contractAddress: ContractAddress;

    const config = getConfig();
    const aliceSecret = resolveSecret(network, 'ALICE');
    const bobSecret = resolveSecret(network, 'BOB');
    const isRemote = network !== 'local';
    const syncTimeoutMs = Number(
        process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ??
            (isRemote ? 3 * 60 * 60_000 : 10 * 60_000),
    );

    const board1x1 = BigInt(1);
    const board1x2 = BigInt(2);
    const board2x1 = BigInt(10);
    const board2x2 = BigInt(11);

    async function queryLedger(providers: BattleshipProviders) {
        const state = await providers.publicDataProvider.queryContractState(contractAddress);
        expect(state).not.toBeNull();
        return ledger(state!.data);
    }

    // setup before tests
    beforeAll(async () => {
        setNetworkId(config.networkId);

        const envConfig: EnvironmentConfiguration = {
            walletNetworkId: config.networkId,
            networkId: config.networkId,
            indexer: config.indexer,
            indexerWS: config.indexerWS,
            node: config.node,
            nodeWS: config.nodeWS,
            faucet: config.faucet,
            proofServer: config.proofServer,
        };

        aliceWallet = await MidnightWalletProvider.build(logger, envConfig, aliceSecret);
        await aliceWallet.start();
        await syncWallet(logger, aliceWallet.wallet, syncTimeoutMs);

        bobWallet = await MidnightWalletProvider.build(logger, envConfig, bobSecret);
        await bobWallet.start();
        await syncWallet(logger, bobWallet.wallet, syncTimeoutMs);

        if (isRemote) {
            // NIGHT→DUST registration per wallet. Seeds are pre-funded; idempotent.
            for (const [name, w] of [
                ['Alice', aliceWallet],
                ['Bob', bobWallet],
            ] as const) {
                const nightBalance = await waitForFunds(
                    w.wallet,
                    envConfig,
                    false,
                    w.unshieldedKeystore,
                );
                logger.info(`${name} NIGHT balance on '${network}': ${nightBalance}`);
            }
        }

        aliceProviders = buildProviders(aliceWallet, zkConfigPath, config);
        bobProviders = buildProviders(bobWallet, zkConfigPath, config);

        logger.info(`Providers initialized on '${network}', ready to test.`);
    });

    // tear down after tests
    afterAll(async () => {
        if(aliceWallet) {
            logger.info('Stopping aliceWallet...');
            await aliceWallet.stop();
        }
        if(bobWallet) {
            logger.info('Stopping bobWallet...');
            await bobWallet.stop();
        }
    });

    it('deploys the contract', async () => {

        const aliceSk = randomBytes(32);
        const alicePrivateState = createBattlePrivateState(
            board1x1,// x1 ship location
            board1x2,// x2
            BoardState.UNSET,
            ShotState.MISS,
            aliceSk,
        );

        const deployed: any = await (deployContract<Contract>)(aliceProviders, {
            compiledContract: CompiledBattleshipContract,
            privateStateId: ALICE_PRIVATE_ID,
            initialPrivateState: alicePrivateState,
            args: [alicePrivateState.x1, alicePrivateState.x2]
        });

        contractAddress = deployed.deployTxData.public.contractAddress;      
        aliceProviders.privateStateProvider.setContractAddress(contractAddress);
        await aliceProviders.privateStateProvider.set(ALICE_PRIVATE_ID, alicePrivateState);
        
        logger.info(`Contract deployed at: ${contractAddress}`);
        expect(contractAddress).toBeDefined();
        expect(contractAddress.length).toBeGreaterThan(0);

        const state = await queryLedger(aliceProviders);
        expect(state.board1State).toEqual(BoardState.SET);
        expect(state.board2State).toEqual(BoardState.UNSET);
        expect(state.winState).toEqual(WinState.CONTINUE_PLAY);
    });
    it('Allows Bob to acceptGame', async () => {
        
        const bobSk = randomBytes(32);
        const bobInitialPrivateState = createBattlePrivateState(
            board2x1,
            board2x2,
            BoardState.UNSET,
            ShotState.MISS,
            bobSk
        );

        bobProviders.privateStateProvider.setContractAddress(contractAddress);
        await bobProviders.privateStateProvider.set(BOB_PRIVATE_ID, bobInitialPrivateState);
        const bobPrivateState = await bobProviders.privateStateProvider.get(BOB_PRIVATE_ID);

        logger.info(`Bob is accepting the game...`);
        const txData: FinalizedCallTxData<Contract, 'acceptGame'> = 
            await (submitCallTx<Contract, 'acceptGame'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'acceptGame',
                args: [bobPrivateState.x1, bobPrivateState.x2]
        });
        logger.info(`Bob successfully joined the game!`);

        const state = await queryLedger(bobProviders);
        expect(state.board2State).toEqual(BoardState.SET);
        expect(state.board2.size()).toEqual(2n);
        expect(state.turn).toEqual(TurnState.PLAYER_1_SHOOT);
    });
    it('Allows Alice to take the first shot(MISS)', async () => {
        const shot = BigInt(5);// miss

        logger.info(`Bob tries to shoot out of turn...`);
        await expect(async () => {
            await (submitCallTx<Contract, 'player2Shoot'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'player2Shoot',
                args: [BigInt(1)]// arbitrary
            });
        }).rejects.toThrow();
        logger.info(`Bobs shot (out of turn) was rejected!`);

        logger.info(`Alice shoots (MISS) at Bobs board...`);
        const txData: FinalizedCallTxData<Contract, 'player1Shoot'> = 
            await (submitCallTx<Contract, 'player1Shoot'>)(aliceProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: ALICE_PRIVATE_ID,
                circuitId: 'player1Shoot',
                args: [shot]
        });
        logger.info(`Alice shot successfully!`);

        const state = await queryLedger(aliceProviders);
        expect(state.board2HitCount).toEqual(0n);
        expect(state.player1Shot.head().is_some).toBeTruthy();
        expect(state.player1Shot.head().value).toEqual(shot);
        expect(state.turn).toEqual(TurnState.PLAYER_2_CHECK);
    });
    it('Allows Bob to check the board (MISS)', async () => {

        logger.info(`Bob checks his board...`);
        const txData: FinalizedCallTxData<Contract, 'checkBoard2'> = 
            await (submitCallTx<Contract, 'checkBoard2'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'checkBoard2',
        });
        logger.info(`Bob successfully checked his board!`);

        const state = await queryLedger(bobProviders);
        expect(state.winState).toEqual(WinState.CONTINUE_PLAY);
        expect(state.board2HitCount).toEqual(0n);
        expect(state.turn).toEqual(TurnState.PLAYER_2_SHOOT);
    });
    it('Allows Bob to shoot(HIT)', async () => {

        logger.info(`Bob shoots at Alice's board (HIT)`);
        const txData: FinalizedCallTxData<Contract, 'player2Shoot'> = 
            await (submitCallTx<Contract, 'player2Shoot'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'player2Shoot',
                args: [board1x1]
        });
        logger.info(`Bob shot successfully!`);

        const state = await queryLedger(bobProviders);
        expect(state.player2Shot.head().is_some).toBeTruthy();
        expect(state.player2Shot.head().value).toEqual(board1x1);
        expect(state.winState).toEqual(WinState.CONTINUE_PLAY);
        expect(state.turn).toEqual(TurnState.PLAYER_1_CHECK);
    });
    it('Allows Alice to check the board and report a hit', async () => {

        logger.info(`Alice is checking the board...`);
        const txData: FinalizedCallTxData<Contract, 'checkBoard1'> = 
            await (submitCallTx<Contract, 'checkBoard1'>)(aliceProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: ALICE_PRIVATE_ID,
                circuitId: 'checkBoard1',
        });
        logger.info(`Alice has finished checking the board!`);

        const state = await queryLedger(aliceProviders);
        expect(state.player2Shot.head().is_some).toBeFalsy();
        expect(state.board1HitCount).toEqual(1n);
        expect(state.board1Hits.member(board1x1)).toBeTruthy();
        expect(state.winState).toEqual(WinState.CONTINUE_PLAY);
        expect(state.turn).toEqual(TurnState.PLAYER_1_SHOOT);
    });
    it('Allows Alice to shoot again (HIT)', async () => {
        
        logger.info(`Alice shoots (HIT) at Bobs board...`);
        const txData: FinalizedCallTxData<Contract, 'player1Shoot'> = 
            await (submitCallTx<Contract, 'player1Shoot'>)(aliceProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: ALICE_PRIVATE_ID,
                circuitId: 'player1Shoot',
                args: [board2x1]
        });
        logger.info(`Alice shot successfully!`);

        const state = await queryLedger(aliceProviders);
        expect(state.board2HitCount).toEqual(0n);
        expect(state.player1Shot.head().is_some).toBeTruthy();
        expect(state.player1Shot.head().value).toEqual(board2x1);
        expect(state.turn).toEqual(TurnState.PLAYER_2_CHECK);
    });
    it('Stops Bob from being a cheater', async () => {

        logger.info(`Bob realizes it is going to be a HIT and tries to cheat...`);
        const bobPrivateState = await bobProviders.privateStateProvider.get(BOB_PRIVATE_ID);
        const cheatBobPrivateState = createBattlePrivateState(
            BigInt(15),
            BigInt(16),
            BoardState.SET,
            ShotState.MISS,
            bobPrivateState.sk,
        );
        await bobProviders.privateStateProvider.set(BOB_PRIVATE_ID, cheatBobPrivateState);
        await expect(async () => {
            await (submitCallTx<Contract, 'checkBoard2'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'checkBoard2',
            });
        }).rejects.toThrow();
        logger.info(`Bobs cheating attempt was rejected!`);

        logger.info(`Bob is resetting his board to the original private state...`);
        await bobProviders.privateStateProvider.set(BOB_PRIVATE_ID, bobPrivateState);
        logger.info(`Bob successfully reverted his private state to the original!`);

        const state = await queryLedger(aliceProviders);
        expect(state.board2HitCount).toEqual(0n);
        expect(state.player1Shot.head().is_some).toBeTruthy();
        expect(state.player1Shot.head().value).toEqual(board2x1);
        expect(state.turn).toEqual(TurnState.PLAYER_2_CHECK);
    });
    it('Allows Bob to check the board for a HIT', async () => {

        logger.info(`Bob checks his board...`);
        const txData: FinalizedCallTxData<Contract, 'checkBoard2'> = 
            await (submitCallTx<Contract, 'checkBoard2'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'checkBoard2',
        });
        logger.info(`Bob successfully checked his board!`);

        const state = await queryLedger(bobProviders);
        expect(state.winState).toEqual(WinState.CONTINUE_PLAY);
        expect(state.board2HitCount).toEqual(1n);
        expect(state.board2Hits.member(board2x1)).toBeTruthy();
        expect(state.turn).toEqual(TurnState.PLAYER_2_SHOOT);
    });
    it('Allows Bob to shoot the winning shot', async () => {

        logger.info(`Bob shoots his second shot(HIT)...`);
        const txData: FinalizedCallTxData<Contract, 'player2Shoot'> = 
            await (submitCallTx<Contract, 'player2Shoot'>)(bobProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: BOB_PRIVATE_ID,
                circuitId: 'player2Shoot',
                args: [board1x2],
        });
        logger.info(`Bob successfully shoots!`);

        const state = await queryLedger(bobProviders);
        expect(state.player2Shot.head().is_some).toBeTruthy();
        expect(state.player2Shot.head().value).toEqual(board1x2);
        expect(state.winState).toEqual(WinState.CONTINUE_PLAY);
        expect(state.turn).toEqual(TurnState.PLAYER_1_CHECK);
    });
    it('Stops Alice from cheating', async () => {

        logger.info(`Alice realizes she is going to lose, so tries to change the ship location...`);
        const oldAlicePrivateState = await aliceProviders.privateStateProvider.get(ALICE_PRIVATE_ID);
        
        // create new private state after retrieving current private state. Not strictly necessary.
        let newAlicePrivateState = await aliceProviders.privateStateProvider.get(ALICE_PRIVATE_ID);
        newAlicePrivateState = createBattlePrivateState(
            BigInt(1),
            BigInt(10),// changed the location locally, but can't change contract
            BoardState.SET,
            ShotState.MISS,
            newAlicePrivateState.sk,
        );
        await aliceProviders.privateStateProvider.set(ALICE_PRIVATE_ID, newAlicePrivateState);

        await expect(async () => {
            await (submitCallTx<Contract, 'checkBoard1'>)(aliceProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: ALICE_PRIVATE_ID,
                circuitId: 'checkBoard1',
            });
        }).rejects.toThrow();
        logger.info(`Alice was rejected from changing the ship location!`);

        logger.info(`Alice resets to original ship location...`);
        await aliceProviders.privateStateProvider.set(ALICE_PRIVATE_ID, oldAlicePrivateState);
        logger.info(`Reverted Alice's private state correctly!`);

    });
    it('Allows Alice to check the board and lose', async () => {
        
        logger.info(`Alice is checking the board...`);
        const txData: FinalizedCallTxData<Contract, 'checkBoard1'> = 
            await (submitCallTx<Contract, 'checkBoard1'>)(aliceProviders, {
                compiledContract: CompiledBattleshipContract,
                contractAddress,
                privateStateId: ALICE_PRIVATE_ID,
                circuitId: 'checkBoard1',
        });
        logger.info(`Alice has finished checking the board!`);

        const state = await queryLedger(aliceProviders);
        expect(state.player2Shot.head().is_some).toBeFalsy();
        expect(state.board1HitCount).toEqual(2n);
        expect(state.board1Hits.member(board1x2)).toBeTruthy();
        expect(state.winState).toEqual(WinState.PLAYER_2_WINS);
        logger.info(`Bob wins!`);
    });
});
