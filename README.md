## On-chain voting for a transaction

Main file: `VotingForTx.sol` in folder `contracts`.

File with additional contracts: `VotingForTx-Extensions.sol` in folder `contracts`.

*All are provided with wide code documentation.*

### Explanation of the base contract

`VotingForTransaction` is the contract that implements mechanism of both voting for a transaction between set of voters and making of this transaction in case of having enough votes.

**Voting mechanism**: pre-set voters (ETH addresses) can make a proposal of transaction and then during pre-set strict amount of time all voters can see it and vote for it. If a voter does not like the proposal, he/she should just do nothing - vote automatically counts as "against". Further, if proposal got enough votes (50% + 1), anyone among voters can make a transaction (but only one time!). If time passes but there was not enough votes or noone wanted to make a transaction then voting for this proposal is ended and voters can suggest a new one.

All transaction properties (address, name of function, data that will be sent (function arguments), value) are stored inside the contract. This might require more gas but in return provide more security.

### Explanation of the additional contracts

`VotingForTransaction_Changeable` is the contract that inherits `VotingForTransaction` and extends it giving ability to change time period of voting and add new voters - all of these using voting inside the same contract.

`VotingForTransaction_ProposalMakers` is the contract that again inherits `VotingForTransaction` and changes restrictions of making proposals: now only proposal makers separated from other voters can suggest transactions for voting.

### Testing the contracts with Hardhat

File `VotingForTx.test.js` in folder `test` contains full-coverage unit tests written in JS for all of these contracts.

To run them, you need to have pre-installed Node.js with NPM and do the next things:

- download all files from this page to a separate folder,
- create new terminal and open the folder with downloaded files in it,
- type in `npm install --save-dev hardhat` and wait till the end of installation,
- type in `npm install --save-dev @nomicfoundation/hardhat-toolbox` and wait till the end of installation,
- type in `npx hardhat test` - this will run tests for the contract.

### The deployed contract

I also deployed the contract `VotingForTransaction_Changeable` to Goerli testnet and verified its bytecode on etherscan, you could check it.

Etherscan: https://goerli.etherscan.io/address/0xadd042c38811afd955e35cd6eaf0031db17a992a#code

Contract address: 0xADD042c38811AfD955e35CD6eaF0031dB17a992a

### Technical notes 

**First.** In my implementation data (function arguments) that is sent with a proposed transaction must in advance be ABI encoded: converted into *bytes32 layout* (left- or right-padded with zero-bytes to a length of 32 bytes) and concatenated into *one bytes variable*.

So if we want to send `uint256` with value `127`, then it must be sent to contract for proposal as such: `0x000000000000000000000000000000000000000000000000000000000000007F`.
1. 127 in decimal is 7F in hexadecimal.
2. Integers are left-padded with zero to 32 bytes.

In contrast, if we want to send `bytes3` with value `"abc"`, then it have to be sent in such form:
`0x6162630000000000000000000000000000000000000000000000000000000000`.
1. 'a' is encoded as 61 in hexadecimal, 'b' as 62 and 'c' as 63.
2. Non-dynamic bytes1..31 are right-padded with zero to 32 bytes.

And if we need to send `127` and `"abc"` together, we must concatenate them into one variable:
`0x000000000000000000000000000000000000000000000000000000000000007F6162630000000000000000000000000000000000000000000000000000000000`.

And so on but cases with dynamic types are bit harder. Look in documentation (https://docs.soliditylang.org/en/latest/abi-spec.html#examples).

Of course, you do not need to do everything that is written above by your own hands. For Ethers.js the most convenient way to do this is to use ABI-coders - again, you could find all about these in their documentation (https://docs.ethers.io/v5/api/utils/abi/coder).

**Second.** Function signature must have strict, canonical form: name of the function with arguments types in parentheses separated by commas without spaces. For example, `"transfer(uint256,address)"` or `"doSmth()"`.
Look in documentation (https://docs.soliditylang.org/en/latest/abi-spec.html#function-selector).
