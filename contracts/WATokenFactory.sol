//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {WAToken} from "./Tokens/WAToken.sol";

contract WATokenFactory is Ownable {
    using Clones for address;
    mapping(address => address) public watokens;

    address public genesisToken;
    address public lendingpool;

    event UpdatedLendingpool(address _lendingpool);
    event CreatedWAToken(address _aToken, address _watoken);
    event RemovedWAToken(address _aToken, address _watoken);

    constructor(address _lendingpool) public {
        lendingpool = _lendingpool;
    }

    function setLendingpool(address _lendingpool) public onlyOwner() {
        lendingpool = _lendingpool;
        emit UpdatedLendingpool(lendingpool);
    }

    function removeWAToken(address _aToken) public onlyOwner() {
        emit RemovedWAToken(_aToken, watokens[_aToken]);
        delete watokens[_aToken];
    }

    function genesis(
        string memory _name,
        string memory _symbol,
        address _asset,
        address _aToken
    ) public onlyOwner() returns (address watoken) {
        require(genesisToken == address(0), "Factory: Genesis already defined");
        require(lendingpool != address(0), "Factory: Lendingpool undefined");
        bytes memory bytecode = type(WAToken).creationCode;
        bytes32 salt =
            keccak256(
                abi.encodePacked(_name, _symbol, _asset, _aToken, lendingpool)
            );
        require(
            watokens[_aToken] == address(0),
            "Factory: Pool already exists"
        );
        assembly {
            watoken := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        WAToken(watoken).initialize(
            _name,
            _symbol,
            _asset,
            lendingpool,
            _aToken
        );
        watokens[_aToken] = watoken;

        genesisToken = watoken;
        emit CreatedWAToken(_aToken, watoken);
    }

    function deployWAToken(
        string memory _name,
        string memory _symbol,
        address _asset,
        address _aToken
    ) public onlyOwner() returns (address watoken) {
        require(genesisToken != address(0), "Factory: Genesis not defined");
        bytes32 salt =
            keccak256(
                abi.encodePacked(_name, _symbol, _asset, _aToken, lendingpool)
            );
        require(
            watokens[_aToken] == address(0),
            "Factory: WAToken already exists"
        );
        watoken = genesisToken.cloneDeterministic(salt);
        WAToken(watoken).initialize(
            _name,
            _symbol,
            _asset,
            lendingpool,
            _aToken
        );
        watokens[_aToken] = watoken;
        emit CreatedWAToken(_aToken, watoken);
    }
}
