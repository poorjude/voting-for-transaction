const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Voting for transaction", function() {
    async function deployUsualVoting() {
        [acc1, acc2, acc3, acc4, acc5] = await ethers.getSigners();

        const voters_ = [acc1.address, acc2.address, acc3.address, acc3.address]; 
        // two same addresses are for test issues
        const timeForVoting_ = 60 * 60 * 24; // == 1 day in seconds

        const votingFactory = await ethers.getContractFactory("VotingForTransaction");
        const voting = await votingFactory.deploy(voters_, timeForVoting_);
        await voting.deployed();

        const voters = [acc1, acc2, acc3];
        const nonVoters = [acc4, acc5];

        return { voting, voters, nonVoters, timeForVoting_ };
    }

    describe("Deployment", function() {
        it("Should be deployed", async function() {
            const { voting } = await loadFixture(deployUsualVoting);
 
            expect(voting.address).not.to.be.undefined;
        });

        it("Should set the right time period of voting", async function() {
            const { voting, timeForVoting_ } = await loadFixture(deployUsualVoting);
 
            expect(await voting.seeTimeForVoting()).to.equal(timeForVoting_);
        });

        it("Should set the right voters", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);
            
            let votersAddresses = await voting.seeVoters();

            for (let eachVoter of voters) {
                expect(votersAddresses).to.include(eachVoter.address);
            }

            expect(votersAddresses.length).to.equal(voters.length);
        });
    });

    describe("Proposal making", function() {
        it("Should check that time has passed since the last proposal", async function() {
            const { voting } = await loadFixture(deployUsualVoting);

            await expect(voting.createProposal(voting.address, "", [], 0))
            .not.to.be.revertedWith("Voting: It is too early!");

            await expect(voting.createProposal(voting.address, "", [], 0))
            .to.be.revertedWith("Voting: It is too early!");
        });

        it("Should check that proposal maker is one of the voters", async function() {
            const { voting, nonVoters } = await loadFixture(deployUsualVoting);

            await expect(voting.connect(nonVoters[0]).createProposal(voting.address, "", [], 0))
            .to.be.revertedWith("Voting: You are not a voter!");

            await expect(voting.createProposal(voting.address, "", [], 0))
            .not.to.be.revertedWith("Voting: You are not a voter!");
        });

        it("Should clear all votes from the previous proposal", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await voting.createProposal(voting.address, "", [], 0);
            await voting.voteForProposal();
            await voting.connect(voters[1]).voteForProposal();

            expect(await voting.seeAreAgreementsEnough()).to.equal(true);

            await voting.makeTransaction();
            await voting.createProposal(voting.address, "", [], 0);

            expect(await voting.seeAreAgreementsEnough()).to.equal(false);
        });

        it("Should set the right properties of the proposed tx", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            let tx = await voting.createProposal(voting.address, "", [], 0);
            let block = await ethers.provider.getBlock(tx.blockNumber);

            expect(await voting.seeCurrentProposal())
            .to.have.all.deep.members([
                voting.address,
                "",
                ethers.utils.hexlify([]),
                ethers.BigNumber.from(0),
                ethers.BigNumber.from(block.timestamp)
            ]);

            await loadFixture(deployUsualVoting);

            tx = await voting.createProposal(
                voters[0].address,
                "transfer(address,uint256)",
                ethers.utils.formatBytes32String("data that will be sent"),
                100
            );
            block = await ethers.provider.getBlock(tx.blockNumber);

            expect(await voting.seeCurrentProposal())
            .to.have.all.deep.members([
                voters[0].address,
                "transfer(address,uint256)",
                ethers.utils.formatBytes32String("data that will be sent"),
                ethers.BigNumber.from(100),
                ethers.BigNumber.from(block.timestamp)
            ]);
        });

        it("Should revert if data was sent but function name is empty", async function() {
            const { voting } = await loadFixture(deployUsualVoting);

            await expect(voting.createProposal(
                voting.address,
                "", 
                ethers.utils.formatBytes32String("data that will be sent"), 
                0
            ))
            .to.be.revertedWith("Voting: You cannot send any args with empty function name!");
        });

        it("Should revert if incorrect data was sent", async function() {
            const { voting } = await loadFixture(deployUsualVoting);

            await expect(voting.createProposal(
                voting.address,
                "functionName()",
                ethers.utils.formatBytes32String("wrong data") + "123456",
                0
            ))
            .to.be.revertedWith("Voting: Wrong data (function args) encoding!");
        });

        it("Should emit `VotingStarted` event on accepting of proposal", async function() {
            const { voting } = await loadFixture(deployUsualVoting);

            await expect(voting.createProposal(
                voting.address,
                "functionName()",
                ethers.utils.formatBytes32String("data"),
                0
            ))
            .to.emit(voting, "VotingStarted");
        });
    });

    describe("Voting for proposal", function() {
        it("Should make a vote for current proposal", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await voting.createProposal(voting.address, "", [], 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            expect(await voting.seeAreAgreementsEnough()).to.equal(true);
        });

        it("Should revert if voting has not started at all", async function() {
            const { voting } = await loadFixture(deployUsualVoting);
            
            await expect(voting.voteForProposal())
            .to.be.revertedWith("Voting: It is too late!");
        });

        it("Should revert if time of voting has passed", async function() {
            const { voting, timeForVoting_ } = await loadFixture(deployUsualVoting);
            
            await voting.createProposal(voting.address, "", [], 0);
            
            await ethers.provider.send("evm_increaseTime", [timeForVoting_ + 1]);
            await ethers.provider.send("evm_mine");

            await expect(voting.voteForProposal())
            .to.be.revertedWith("Voting: It is too late!");
        });

        it("Should revert if proposed tx was already made", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);
            
            await voting.createProposal(voting.address, "", [], 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();

            await expect(voting.voteForProposal())
            .to.be.revertedWith("Voting: It is too late!");
        });

        it("Should revert if caller is not a voter", async function() {
            const { voting, nonVoters } = await loadFixture(deployUsualVoting);

            await voting.createProposal(voting.address, "", [], 0);

            for(let eachNonVoter of nonVoters) {
                await expect(voting.connect(eachNonVoter).voteForProposal())
                .to.be.revertedWith("Voting: You are not a voter!");
            }
        });
    });

    describe("Transaction making", function() {
        it("Should check whether there is enough votes or not", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await voting.createProposal(voting.address, "", [], 0);

            await expect(voting.makeTransaction())
            .to.be.revertedWith("Voting: Not enough votes for current proposal!");

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction())
            .not.to.be.revertedWith("Voting: Not enough votes for current proposal!");
        });

        it("Should check that proposal maker is one of the voters", async function() {
            const { voting, voters, nonVoters } = await loadFixture(deployUsualVoting);

            await voting.createProposal(voting.address, "", [], 0);
            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.connect(nonVoters[0]).makeTransaction())
            .to.be.revertedWith("Voting: You are not a voter!");

            await expect(voting.connect(voters[1]).makeTransaction())
            .not.to.be.revertedWith("Voting: You are not a voter!");
        });

        it("Should make the tx with empty function signature right", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await voting.replenishFunds({ value: ethers.utils.parseEther("1") });

            await voting.createProposal(
                voters[1].address, 
                "", 
                [], 
                ethers.utils.parseEther("1")
            );

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction()).to.changeEtherBalances(
                [voting, voters[1]],
                [
                    ethers.BigNumber.from("-1000000000000000000"), 
                    ethers.BigNumber.from("1000000000000000000")
                ]
            );
        });

        it("Should make the tx with function signature and without data right", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            const testContrFactory = await ethers.getContractFactory("Test");
            const testContr = await testContrFactory.deploy();
            await testContr.deployed();

            await voting.createProposal(testContr.address, "changeTo24()", [], 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();

            expect(await testContr.x()).to.equal(24);
        });

        it("Should make the tx with function signature and data right", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            // 1

            const testContrFactory = await ethers.getContractFactory("Test");
            const testContr = await testContrFactory.deploy();
            await testContr.deployed();

            let newX = 58;
            let data = ethers.utils.defaultAbiCoder.encode(["uint256"], [newX]);

            await voting.createProposal(
                testContr.address, 
                "changeToWhatYouWant(uint256)", 
                data, 
                0
            );

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();

            expect(await testContr.x()).to.equal(newX);

            // 2

            newX = [1, 2, 3, 4, 5];
            data = ethers.utils.defaultAbiCoder.encode(["uint256[]"], [newX]);

            await voting.createProposal(
                testContr.address, 
                "changeToWhatYouWantWithArray(uint256[])",
                data, 
                0
            );

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();

            expect(await testContr.x()).to.equal(newX[1]);
        });

        it("Should emit `TransactionMade` event", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await voting.createProposal(voters[1].address, "", [], 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction()).to.emit(voting, "TransactionMade");
        });

        it("Should set right tx properties in `TransactionMade` event", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            // 1

            await voting.replenishFunds({ value: 1000 });
            let tx = await voting.createProposal(voters[1].address, "", [], 1000);
            let block = await ethers.provider.getBlock(tx.blockNumber);
            
            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction()).to.emit(voting, "TransactionMade")
            .withArgs(true, [], voters[1].address, "", [], 1000, block.timestamp);

            // 2

            const testContrFactory = await ethers.getContractFactory("Test");
            const testContr = await testContrFactory.deploy();
            await testContr.deployed();

            tx = await voting.createProposal(testContr.address, "wrongFunctionName()", [], 57);
            block = await ethers.provider.getBlock(tx.blockNumber);
            
            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction()).to.emit(voting, "TransactionMade")
            .withArgs(false, [], testContr.address, "wrongFunctionName()", [], 57, block.timestamp);
        });

        it("Should not allow to make the same tx twice", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await voting.replenishFunds({ value: 5000 });
            await voting.createProposal(voters[1].address, "", [], 1000);
            
            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction())
            .to.changeEtherBalance(voters[1], 1000);

            await expect(voting.makeTransaction())
            .to.be.revertedWith("Voting: It is too late!");
        });

        it("Should not allow to do reentrancy", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            const testContrFactory = await ethers.getContractFactory("Test");
            const testContr = await testContrFactory.deploy();
            await testContr.deployed();

            await voting.replenishFunds({ value: 10000 });
            await voting.createProposal(testContr.address, "reentrancy()", [], 1000);
            
            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction())
            .to.changeEtherBalances([voting, testContr], [-1000, 1000]);
        });
    });

    describe("Receiving Ether", function() {
        it("Should receive it", async function() {
            const { voting, nonVoters } = await loadFixture(deployUsualVoting);

            await expect(voting.replenishFunds({ value: 324 }))
            .to.changeEtherBalance(voting, 324);

            await expect(voting.connect(nonVoters[0]).replenishFunds({ value: 500 }))
            .to.changeEtherBalance(voting, 500);
        });

        it("Should revert if no Ether was sent", async function() {
            const { voting } = await loadFixture(deployUsualVoting);

            await expect(voting.replenishFunds())
            .to.be.revertedWith("Voting: You did not send any Ether!");
        });

        it("Should emit `FundsReplenished` event", async function() {
            const { voting, voters } = await loadFixture(deployUsualVoting);

            await expect(voting.replenishFunds({ value: 328 }))
            .to.emit(voting, "FundsReplenished").withArgs(voters[0].address, 328);
        });
    });
});

describe("Voting for transaction (changeable version)", function() {
    async function deployVotingChangeable() {
        [acc1, acc2, acc3, acc4, acc5] = await ethers.getSigners();

        const voters_ = [acc1.address, acc2.address, acc3.address];
        const timeForVoting_ = 60 * 60 * 24; // == 1 day in seconds

        const votingFactory = await ethers.getContractFactory("VotingForTransaction_Changeable");
        const voting = await votingFactory.deploy(voters_, timeForVoting_);
        await voting.deployed();

        const voters = [acc1, acc2, acc3];
        const nonVoters = [acc4, acc5];

        return { voting, voters, nonVoters, timeForVoting_ };
    }

    describe("Adding of new voters", function() {
        it("Should check that tx was initialised after voting", async function() {
            const { voting, voters, nonVoters } = await loadFixture(deployVotingChangeable);

            await expect(voting.addVoters( [ nonVoters[0].address ] ))
            .to.be.revertedWith("Voting_Changeable: You should use voting to do this!");

            const data = 
            ethers.utils.defaultAbiCoder.encode(["address[]"], [ [nonVoters[0].address] ]);

            await voting.createProposal(voting.address, "addVoters(address[])", data, 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction())
            .not.to.be.revertedWith("Voting_Changeable: You should use voting to do this!");
        });

        it("Should add new voters", async function() {
            const { voting, voters, nonVoters } = await loadFixture(deployVotingChangeable);

            // 1

            let data = 
            ethers.utils.defaultAbiCoder.encode(["address[]"], [ [nonVoters[0].address] ]);

            await voting.createProposal(voting.address, "addVoters(address[])", data, 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();
            expect(await voting.seeVoters()).to.include(nonVoters[0].address);

            // 2

            await loadFixture(deployVotingChangeable);

            data = ethers.utils.defaultAbiCoder.encode(
                ["address[]"], 
                [ [nonVoters[0].address, nonVoters[1].address] ]
            );

            await voting.createProposal(voting.address, "addVoters(address[])", data, 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();
            expect(await voting.seeVoters()).to.include(nonVoters[0].address);
            expect(await voting.seeVoters()).to.include(nonVoters[1].address);
        });

        it("Should not add same voters multiple times", async function() {
            const { voting, voters } = await loadFixture(deployVotingChangeable);

            const oldLength = (await voting.seeVoters()).length;
            const oldVoters = await voting.seeVoters();
            let data = 
            ethers.utils.defaultAbiCoder.encode(["address[]"], [ [voters[1].address] ]);

            await voting.createProposal(voting.address, "addVoters(address[])", data, 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();

            expect(await voting.seeVoters()).to.have.all.members(oldVoters);
            expect((await voting.seeVoters()).length).to.equal(oldLength);
        });
    });

    describe("Changing time for voting", function() {
        it("Should check that tx was initialised after voting", async function() {
            const { voting, voters } = await loadFixture(deployVotingChangeable);

            const newTime = 539;
            await expect(voting.changeTimeForVoting(newTime))
            .to.be.revertedWith("Voting_Changeable: You should use voting to do this!");

            const data = 
            ethers.utils.defaultAbiCoder.encode(["uint256"], [newTime]);

            await voting.createProposal(voting.address, "changeTimeForVoting(uint256)", data, 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await expect(voting.makeTransaction())
            .not.to.be.revertedWith("Voting_Changeable: You should use voting to do this!");
        });

        it("Should change time for voting", async function() {
            const { voting, voters } = await loadFixture(deployVotingChangeable);

            const newTime = 539;
            const data = 
            ethers.utils.defaultAbiCoder.encode(["uint256"], [newTime]);

            await voting.createProposal(voting.address, "changeTimeForVoting(uint256)", data, 0);

            for(let eachVoter of voters) {
                await voting.connect(eachVoter).voteForProposal();
            }

            await voting.makeTransaction();

            expect(await voting.seeTimeForVoting()).to.equal(newTime);
        });
    });
});

describe("Voting for transaction (version with separate proposal makers)", function() {
    async function deployVotingPrMakers() {
        [acc1, acc2, acc3, acc4, acc5, acc6, acc7] = await ethers.getSigners();

        const voters_ = [acc1.address, acc2.address, acc3.address];
        const proposalMakers_ = [acc6.address, acc7.address ];
        const timeForVoting_ = 60 * 60 * 24; // == 1 day in seconds

        const votingFactory = await ethers.getContractFactory("VotingForTransaction_ProposalMakers");
        const voting = await votingFactory.deploy(voters_, proposalMakers_, timeForVoting_);
        await voting.deployed();

        const voters = [acc1, acc2, acc3];
        const nonVoters = [acc4, acc5];
        const proposalMakers = [acc6, acc7];

        return { voting, voters, nonVoters, proposalMakers, timeForVoting_ };
    }

    describe("Deployment", function() {
        it("Should set the right proposal makers", async function() {
            const { voting, proposalMakers  } = await loadFixture(deployVotingPrMakers);

            for (let each of proposalMakers) {
                expect(await voting.isProposalMaker(each.address)).to.equal(true);
            }
        });
    });

    describe("Proposal making", function() {
        it("Should check whether caller is a proposal maker or not", async function() {
            const { voting, nonVoters, proposalMakers  } = await loadFixture(deployVotingPrMakers);

            await expect(voting.createProposal(voting.address, "", [], 0))
            .to.be.revertedWith("Voting_PrMaker: You are not a proposal maker!");

            await expect(voting.connect(nonVoters[0])
            .createProposal(voting.address, "", [], 0))
            .to.be.revertedWith("Voting_PrMaker: You are not a proposal maker!");

            await expect(voting.connect(proposalMakers[0])
            .createProposal(voting.address, "", [], 0))
            .not.to.be.revertedWith("Voting_PrMaker: You are not a proposal maker!");
        });
    });
});