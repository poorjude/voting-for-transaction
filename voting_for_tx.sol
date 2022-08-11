// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

/**
 * @title Voting for transaction.
 * @dev Contract that implements mechanism of both voting for transaction between set of voters and
 * making of this transaction in case of having enough votes.
 *
 * Voting mechanism: pre-set voters (addresses) can make a proposal of transaction and then during
 * pre-set strict amount of time all voters can see it and vote for it by calling special function.
 * If somebody does not like the proposal, he/she just should do nothing. Then, if proposal got 
 * enough votes (50% + 1), anyone among voters can make a transaction but only one time. If time passes
 * but there was not enough votes or noone wanted to make a transaction then voting for this proposal
 * is ended and voters can suggest a new one.
 * 
 * All transaction properties (address, name of function, data that will be sent (function arguments),
 * value) are stored inside the contract. 
 * 
 * NOTE: It is only possible to send no more than 10 arguments with transaction in this implementation
 * and all arguments must be converted into (!) bytes32 (!) layout (left- or right-padded with zero-bytes 
 * to a length of 32 bytes). Also, function selector must have strict, canonical form - it is hashed and
 * pruned to 4 bytes inside the contract.
 * Links to documentation:
 * 1. Function selector: https://docs.soliditylang.org/en/latest/abi-spec.html#function-selector
 * 2. Args encoding: https://docs.soliditylang.org/en/latest/abi-spec.html#formal-specification-of-the-encoding
 */
contract VotingForTransaction {
    event TransactionMade(address targetAddress, 
                          string functionSelector, 
                          bytes32[] dataToSend, 
                          uint256 valueToSend, 
                          uint256 proposalTime, 
                          bytes result);

    event FundsReplenished(address giver, uint256 amount);

    address[] voters;
    mapping(address => bool) isVoter;
    mapping(address => bool) isAgreed;

    uint256 timeForVoting;

    address targetAddress;
    string functionSelector;
    bytes32[10] argumentsToSend;
    uint256 argumentsAmount;
    uint256 valueToSend;
    uint256 proposalTime;

    /**
     * @dev Sets voters and time period of voting.
     * @param voters_ is an array of addresses that will become voters.
     * @param timeForVoting_ is period of time in seconds during which it is possible to vote
     * and to make a proposed transaction.
    */
    constructor(address[] memory voters_, uint256 timeForVoting_) {
        uint256 length = voters_.length;
        address currVoter;
        for (uint256 i; i < length;) {
            currVoter = voters_[i];
            // To make sure there is no repeating addresses (this would impact on vote count)
            if (isVoter[currVoter]) { ++i; continue; }

            voters.push(currVoter);
            isVoter[currVoter] = true;
            unchecked { ++i; }
        }

        timeForVoting = timeForVoting_;
    }

    /**
     * @dev Throws an error if caller is not a voter.
    */
    modifier onlyForVoters() {
        require(isVoter[msg.sender], "Voting: You are not a voter!");
        _;
    }

    /**
     * @dev Throws an error if time for voting has not ended.
    */
    modifier timePassed() {
        require(block.timestamp >= proposalTime + timeForVoting, "Voting: It is too early!");
        _;
    }

    /**
     * @dev Throws an error if time for voting has ended.
    */
    modifier timeNotPassed() {
        require(block.timestamp < proposalTime + timeForVoting, "Voting: It is too late!");
        _;
    }
    
    /**
     * @notice Returns properties of transaction that is currently on voting.
     * Requirements: time for voting must not expire.
    */
    function seeCurrentProposal() external view timeNotPassed returns(address, string memory, bytes32[] memory, uint256, uint256) {
        return (targetAddress, functionSelector, _returnCorrectArgs(), valueToSend, proposalTime);
    }

    /**
     * @notice Returns time period for voting in seconds.
    */
    function seeTimeForVoting() external view returns(uint256) {
        return timeForVoting;
    }

    /**
     * @notice Returns true if (50% + 1) of voters agree on the current proposal and
     * false if not.
     * Requirements: time for voting must not expire.
    */
    function seeAreAgreementsEnough() external view timeNotPassed returns(bool) {
        return _areAgreementsEnough();
    }

    /**
     * @notice Votes for current proposal. Be careful! This cannot be undone. 
     * Requirements: caller must be one of the voters and time for voting must not expire.
    */
    function voteForProposal() external timeNotPassed onlyForVoters {
        isAgreed[msg.sender] = true;
    }

    /**
     * @notice Creates a proposal that will be sent on voting.
     * Requirements: caller must be one of the voters and time for voting must expire.
     * 
     * @param targetAddress_ is eth address where transaction should go to.
     * @param functionSelector_ is selector of function that will be called (must have strict,
     * canonical form - it is hashed and pruned to 4 bytes later in function {makeTransaction}).
     * Leave it as an empty string if it is only needed to send ether.
     * @param argumentsToSend_ is an array of arguments that will be sent with function
     * signature. There must be 10 or less args and all of them must be converted into 
     * (!) bytes32 (!) layout (left- or right-padded with zero-bytes to a length of 32 bytes).
     * Leave it as an empty array if it is not needed to send args with function.
     * @param argumentsAmount_ is amount of args that will be sent.
     * @param valueToSend_ is value (in wei) that will be sent. Leave it equal to zero if it is
     * not needed to send any ether.
    */
    function createProposal(
                            address targetAddress_, 
                            string calldata functionSelector_, 
                            bytes32[] calldata argumentsToSend_,
                            uint256 argumentsAmount_,
                            uint256 valueToSend_
                            ) external 
                            timePassed 
                            onlyForVoters
                            virtual {
        // Clearing votes for previous proposal
        _clearVotes();

        // Set properties of new transaction
        targetAddress = targetAddress_;
        functionSelector = functionSelector_;
        valueToSend = valueToSend_;

        // Set data (arguments of function) if it was sent
        if (bytes(functionSelector_).length == 0) {
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

    /**
     * @notice Creates a proposal that will be sent on voting.
     * Requirements: caller must be one of the voters, time for voting (therefore,
     * making of transaction) must not expire, there must be enough votes for proposal.
    */
    function makeTransaction() external timeNotPassed onlyForVoters {
        require(_areAgreementsEnough(), "Voting: Not enough votes for current proposal!");

        // Making of transaction
        bool success;
        bytes memory result;
        if (bytes(functionSelector).length == 0) {
            // If there is no function selector (and, therefore, no arguments)
            (success, result) = targetAddress.call{value: valueToSend}("");
        } else if (argumentsAmount == 0){
            // If there is function selector but no arguments
            (success, result) = targetAddress.call{value: valueToSend}(abi.encodeWithSignature(functionSelector));
        } else {
            // If there is function selector and arguments
            (success, result) = targetAddress.call{value: valueToSend}(abi.encodeWithSignature(functionSelector, _returnCorrectArgs()));
        }
        require(success, "Voting: Transaction failed!");
        emit TransactionMade(targetAddress, functionSelector, _returnCorrectArgs(), valueToSend, proposalTime, result);

        // Set time of last proposal to almost zero to prevent making same multiple 
        // transactions and to instantly get ability to make new proposals
        proposalTime = 1;
    }

    /**
     * @notice Sends some ether to this contract.
    */
    function replenishFunds() external payable {
        emit FundsReplenished(msg.sender, msg.value);
    }

    /**
     * @dev Returns true if (50% + 1) of voters agree on the current proposal and
     * false if not.
    */
    function _areAgreementsEnough() internal view returns(bool) {
        return _countAgreements() >= (voters.length / 2 + 1);
    }

    /**
     * @dev Returns amount of agreements.
    */
    function _countAgreements() internal view returns(uint256) {
        uint256 agreementsAmount;

        uint256 votersAmount = voters.length;
        for (uint256 i; i < votersAmount;) {
            if (isAgreed[voters[i]] == true) {
                unchecked { ++agreementsAmount; }
            }
            unchecked { ++i; }
        }

        return agreementsAmount;
    }

    /**
     * @dev Clear all votes for (expired) proposal.
    */
    function _clearVotes() internal {
        uint256 votersAmount = voters.length;
        for (uint256 i; i < votersAmount;) {
            if (isAgreed[voters[i]] == true) {
                isAgreed[voters[i]] = false;
            }
            unchecked { ++i; }
        }
    }

    /**
     * @dev Returns an array of arguments that may be sent with transaction.
     * (Most of the time not all 10 places for arguments in storage will be used.)
    */
    function _returnCorrectArgs() internal view returns (bytes32[] memory) {
        uint256 _argumentsAmount = argumentsAmount;
        bytes32[] memory _correctArguments = new bytes32[](_argumentsAmount);
        for (uint256 i; i < _argumentsAmount;) {
            _correctArguments[i] = argumentsToSend[i];
            unchecked { ++i; }
        }
        return _correctArguments;
    }
}



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
                            string calldata functionSelector_, 
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
        functionSelector = functionSelector_;
        valueToSend = valueToSend_;

        // Set data (arguments of function) if it was sent
        if (bytes(functionSelector_).length == 0) {
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