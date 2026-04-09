# Battleship Example

This repository demonstrates a simple version of the board game Battleship. The game board is represented as a single number line and ships are a single number placed on the number line. The first player to guess the 2 ship locations wins the game.

This example aims to demonstrate several key features of Compact and Midnight JS including:
- Compact contracts as state machines
- Explicit state management
- Verification of private state data
- Access control to circuits
- Operations on a `List`
- Intermediate witness functionality

## Set up project
```bash
git clone git@github.com:midnightntwrk/example-battleship
```

Install dependencies:
```bash
yarn install
```

## Compile the contract
```bash
yarn compile
```

## Start Docker container

Ensure the docker engine is running:
```bash
yarn env:up
```

## Run the test suite
```bash
yarn test:local
```

The test script will begin to display output from your local devnet and test suite. The tests will progress the contract deployment and interaction programatically:
```
[13:44:22.493] INFO (17759): Wallet sync complete after 22 emissions
[13:44:22.509] INFO (17759): Providers initialized, ready to test.
[13:44:44.438] INFO (17759): Contract deployed at: 570de8b6854263eb21ee350c325179e88eba2bd6744f142351b05028e3d09246
[13:44:44.742] INFO (17759): Bob is accepting the game...
[13:45:07.948] INFO (17759): Bob successfully joined the game!
[13:45:07.987] INFO (17759): Bob tries to shoot out of turn...
[13:45:08.192] INFO (17759): Bobs shot (out of turn) was rejected!
[13:45:08.192] INFO (17759): Alice shoots (MISS) at Bobs board...
[13:45:31.952] INFO (17759): Alice shot successfully!
[13:45:31.990] INFO (17759): Bob checks his board...
[13:45:55.914] INFO (17759): Bob successfully checked his board!
[13:45:55.926] INFO (17759): Bob shoots at Alice's board (HIT)
[13:46:14.621] INFO (17759): Bob shot successfully!
[13:46:14.639] INFO (17759): Alice is checking the board...
[13:46:38.641] INFO (17759): Alice has finished checking the board!
[13:46:38.657] INFO (17759): Alice shoots (HIT) at Bobs board...
[13:46:56.054] INFO (17759): Alice shot successfully!
[13:46:56.078] INFO (17759): Bob realizes it is going to be a HIT and tries to cheat...
[13:46:56.364] INFO (17759): Bobs cheating attempt was rejected!
[13:46:56.364] INFO (17759): Bob is resetting his board to the original private state...
[13:46:56.419] INFO (17759): Bob successfully reverted his private state to the original!
[13:46:56.433] INFO (17759): Bob checks his board...
[13:47:20.032] INFO (17759): Bob successfully checked his board!
[13:47:20.044] INFO (17759): Bob shoots his second shot(HIT)...
[13:47:38.720] INFO (17759): Bob successfully shoots!
[13:47:38.733] INFO (17759): Alice realizes she is going to lose, so tries to change the ship location...
[13:47:38.829] INFO (17759): Alice was rejected from changing the ship location!
[13:47:38.829] INFO (17759): Alice resets to original ship location...
[13:47:38.848] INFO (17759): Reverted Alice's private state correctly!
[13:47:38.848] INFO (17759): Alice is checking the board...
 ✓ src/test/battleship.test.ts (12 tests) 222585ms
   ✓ Battleship Smart Contract via midnight-js > deploys the contract  21945ms
   ✓ Battleship Smart Contract via midnight-js > Allows Bob to acceptGame  23524ms
   ✓ Battleship Smart Contract via midnight-js > Allows Alice to take the first shot(MISS)  24007ms
   ✓ Battleship Smart Contract via midnight-js > Allows Bob to check the board (MISS)  23936ms
   ✓ Battleship Smart Contract via midnight-js > Allows Bob to shoot(HIT)  18713ms
   ✓ Battleship Smart Contract via midnight-js > Allows Alice to check the board and report a hit  24017ms
   ✓ Battleship Smart Contract via midnight-js > Allows Alice to shoot again (HIT)  17421ms
   ✓ Battleship Smart Contract via midnight-js > Stops Bob from being a cheater  355ms
   ✓ Battleship Smart Contract via midnight-js > Allows Bob to check the board for a HIT  23611ms
   ✓ Battleship Smart Contract via midnight-js > Allows Bob to shoot the winning shot  18689ms
   ✓ Battleship Smart Contract via midnight-js > Stops Alice from cheating by changing her ship location 115ms
   ✓ Battleship Smart Contract via midnight-js > Allows Alice to check the board and realize she lost...  23960ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  13:44:16
   Duration  226.20s (transform 231ms, setup 0ms, collect 3.37s, tests 222.59s, environment 0ms, prepare 62ms)

Done in 227.08s.
```

To run the zkir linter, from the project root run:
```bash
npx compact-zkir-lint -r contract/managed/battleship/zkir
```

The output should look like this:
```
zkir-lint: scanned 5 file(s)

  acceptGame (v2, k=12): clean
    instructions: 159  inputs: 2  constrain_bits: 4  cond_select: 6
    guarded regions: 0 (max depth 0)  proof payload: ~192KB

  checkBoard1 (v2, k=12): clean
    instructions: 400  inputs: 0  constrain_bits: 2  cond_select: 62
    guarded regions: 0 (max depth 1)  proof payload: ~192KB

  checkBoard2 (v2, k=12): clean
    instructions: 416  inputs: 0  constrain_bits: 2  cond_select: 61
    guarded regions: 0 (max depth 1)  proof payload: ~192KB

  player1Shoot (v2, k=11): clean
    instructions: 185  inputs: 1  constrain_bits: 3  cond_select: 4
    guarded regions: 0 (max depth 0)  proof payload: ~96KB

  player2Shoot (v2, k=11): clean
    instructions: 168  inputs: 1  constrain_bits: 3  cond_select: 4
    guarded regions: 0 (max depth 0)  proof payload: ~96KB

0 error(s), 0 warning(s), 0 info(s) | 5/5 clean
```

This repository is currently only set up to support a local devnet running via Docker. The configurations for other networks and handling of those configs can be set up in `config.ts` and supporting files to enable their operation.
