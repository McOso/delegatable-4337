//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Purpose is Ownable {
    string public purpose = "What is my purpose?";

    function setPurpose(string memory purpose_) public onlyOwner {
        purpose = purpose_;
    }

    function alwaysFail() public pure {
        revert("I always fail");
    }
}
