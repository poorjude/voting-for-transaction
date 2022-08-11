## On-chain voting for transaction

Main file: `VotingForTx.sol`

The most convenient way to compile and deploy smart contracts is to use Remix IDE (https://remix.ethereum.org). Though you could use any IDE that supports Solidity.

*All code is widely provided with documentation.*

### Explanation of base contract

`VotingForTx.sol` is contract that implements mechanism of both voting for transaction between set of voters and making of this transaction in case of having enough votes.

**Voting mechanism**: (pre-set during construction) voters (addresses) can make a proposal of transaction and then during (pre-set during construction) strict amount of time all voters can see it and vote for it. If a voter does not like the proposal, he/she should just do nothing - vote automatically counts as "against". Then, if proposal got  enough votes (50% + 1), anyone among voters can make a transaction (but only one time!). If time passes but there was not enough votes or noone wanted to make a transaction then voting for this proposal is ended and voters can suggest a new one.

All transaction properties (address, name of function, data that will be sent (function arguments), value) are stored inside the contract. This might require more gas but in return provide more security.

### Technical notes 

**First.** In my implementation it is possible to send no more than 10 arguments with transaction and all arguments in advance must be converted into *bytes32 layout* (left- or right-padded with zero-bytes to a length of 32 bytes) as in ABI encoding of arguments in EVM. 

So if we want to send `uint256` with value `127`, then it must be sent to contract for proposal as such: `0x000000000000000000000000000000000000000000000000000000000000007F`.
1. 127 in decimal is 7F in hexadecimal.
2. Integers are left-padded with zero to 32 bytes.

In opposite, if we want to send `bytes3` with value `"abc"`, then it have to be sent in such form:
`0x6162630000000000000000000000000000000000000000000000000000000000`.
1. 'a' is encoded as 61 in hexadecimal, 'b' as 62 and 'c' as 63.
2. Non-dynamic bytes1..31 are right-padded with zero to 32 bytes.

And so on but cases with dynamic types are bit harder. Look in documentation (https://docs.soliditylang.org/en/latest/abi-spec.html#examples).

**Second.** Function signature must have strict, canonical form: name of the function with arguments in parentheses separated by commas and without spaces. For example, *"transfer(uint256,address)"* or *"doSmth()"*.
Look in documentation (https://docs.soliditylang.org/en/latest/abi-spec.html#function-selector).
