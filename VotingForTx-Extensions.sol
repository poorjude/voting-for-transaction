// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "./voting_for_tx_1.sol";

/**
 * @title Voting for transaction (changeable version).
 * @dev This contract inherits {VotingForTransaction} and adds posibility to change
 * time period of voting and add new voters - both actions can be done after voting
 * inside the same contract.
 */
contract VotingForTransaction_Changeable is VotingForTransaction {
    /**
     * @dev See {VotingForTransaction-constructor}.
    */
    constructor(address[] memory voters_, uint256 timeForVoting_) VotingForTransaction(voters_, timeForVoting_) {}

    /**
     * @dev Throws an error if function is not called by the same contract address.
     * (The only way to do this is to call {VotingForTransaction-makeTransaction}
     * with enough votes for this.)
    */
    modifier votedOnly() {
        require(msg.sender == address(this), "Voting_Changeable: You should use voting to do this!");
        _;
    }

    /**
     * @dev Adds new voter.
     * Requirements: must be called from the same contract address.
     * @param newVoter is address of a new voter.
    */
    function addVoter(address newVoter) external votedOnly {
        require(!isVoter[newVoter], "Voting_Changeable: This address already has voting rights!");
        voters.push(newVoter);
        isVoter[newVoter] = true;
    }

    /**
     * @dev Changes current time for voting.
     * Requirements: must be called from the same contract address.
     * @param newTimeForVoting is time period in seconds during which it is
     * possible to vote and make a transaction.
    */
    function changeTimeForVoting(uint256 newTimeForVoting) external votedOnly {
        timeForVoting = newTimeForVoting;
    }
}



/**
 * @title Voting for transaction (version with separate proposal makers)
 * @dev This contract inherits {VotingForTransaction} and limits possibility
 * to make proposals - now only separate people (proposal makers) can do this.
 * Note that any voter can still call function {makeTransaction} if there is
 * enough agreements.
 */
contract VotingForTransaction_ProposalMakers is VotingForTransaction {
    mapping(address => bool) isProposalMaker;

    /**
     * @dev Sets proposal makers.
     * @param proposalMakers_ is an array of addresses that will be able to make
     * proposals.
     *
     * For others see {VotingForTransaction-constructor}.
    */
    constructor(
                address[] memory voters_, 
                address[] memory proposalMakers_, 
                uint256 timeForVoting_) 
                VotingForTransaction(voters_, timeForVoting_) {
                    uint256 length = proposalMakers_.length;
                    for (uint256 i; i < length;) {
                        isProposalMaker[proposalMakers_[i]] = true;
                        unchecked { ++i; }
                    }
                }

    /**
     * @dev Throws an error if caller is not a proposal maker.
    */
    modifier proposalMakersOnly() {
        require(isProposalMaker[msg.sender], "Voting_PrMaker: You are not a proposal maker!");
        _;
    }

    /**
     * @dev See {VotingForTransaction-createProposal} - almost everything is
     * same; the only difference is in `proposalMakersOnly` modifier.
     * Requirements: caller must be a proposal maker.
     *
     * NOTE: Unfortunately, it is not possible to override this function with
     * 'super' keyword because then it will have `onlyForVoters` modifier and,
     * therefore, caller must be both proposal maker and voter. In such case
     * contract logic will be broken so we have to copy-paste whole function
     * just changing modifier.
    */
    function createProposal(
                            address targetAddress_, 
                            string calldata functionSignature_, 
                            bytes32[] calldata argumentsToSend_,
                            uint256 argumentsAmount_,
                            uint256 valueToSend_
                            ) external 
                            timePassed 
                            proposalMakersOnly 
                            override {
        // Clearing votes for previous proposal
        _clearVotes();

        // Set properties of new transaction
        targetAddress = targetAddress_;
        functionSignature = functionSignature_;
        valueToSend = valueToSend_;

        // Set data (arguments of function) if it was sent
        if (bytes(functionSignature_).length == 0) {
            require(argumentsToSend_.length == 0, "Voting: You cannot send any args with empty function definition!");
        }
        require(argumentsToSend_.length == argumentsAmount_, "Voting: Submitted amount of args does not equal to real one!");
        require(argumentsAmount_ <= 10, "Voting: You cannot send more than 10 args!");
        for (uint256 i; i < argumentsAmount_;) {
            argumentsToSend[i] = argumentsToSend_[i];
            unchecked { ++i; }
        }
        argumentsAmount = argumentsAmount_;
        
        // Set time of transaction proposal
        proposalTime = block.timestamp;
    }
}
