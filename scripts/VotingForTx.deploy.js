const { ethers } = require("hardhat");

async function main() {
    const [acc1, acc2, acc3, acc4, acc5] = ethers.getSigners();

    const voters_ = [acc1.address, acc2.address, acc3.address];
    const timeForVoting_ = 60 * 60 * 24; // == 1 day in seconds

    const votingFactory = await ethers.getContractFactory("VotingForTransaction");
    const voting = await votingFactory.deploy(voters_, timeForVoting_);

    await voting.deployed();

    console.log("Contract is deployed to", voting.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});