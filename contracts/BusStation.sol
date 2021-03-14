//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

//import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Permit} from "./Tokens/ERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {ERCHushPool} from "./ERCHushPool.sol";

contract BusStation {
    struct Ticket {
        uint96 fee;
        address buyer;
    }

    using SafeERC20 for ERC20Permit;

    mapping(uint256 => Ticket) public tickets;

    uint256 public immutable depositAmount;
    uint256 public immutable ZEROLEAF;
    ERC20Permit public immutable token;

    ERCHushPool public hush;

    event BuyTicket(uint256 commitment, uint96 fee);

    // We need to extract these values, but for now, just do this
    constructor(address _hush) public {
        hush = ERCHushPool(_hush);
        token = ERC20Permit(address(hush.token()));
        depositAmount = hush.depositAmount();
        ZEROLEAF = hush.ZEROLEAF();
    }

    function buyTicket(uint256 _commitment, uint96 _fee) public {
        require(tickets[_commitment].buyer == address(0), "Already used");
        Ticket memory ticket = Ticket({fee: _fee, buyer: msg.sender});
        tickets[_commitment] = ticket;
        emit BuyTicket(_commitment, _fee);
    }

    function buyTicketWithPermit(
        uint256 _commitment,
        uint96 _fee,
        uint256 _amount,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public {
        // owner = msg.sender
        // spender = address(this)
        token.permit(msg.sender, address(this), _amount, _deadline, _v, _r, _s);
        buyTicket(_commitment, _fee);
    }

    function driveBus(uint256[8] memory proof, uint256[11] memory input)
        public
    {
        uint8 deposits = 0;
        uint8 driverDeposits = 0;
        for (uint8 i = 3; i < 11; i++) {
            Ticket memory t = tickets[input[i]];
            if (t.buyer != address(0)) {
                uint256 transferAmount = t.fee + depositAmount;
                // Transfer funds
                token.safeTransferFrom(t.buyer, address(this), transferAmount);
                deposits++;
                delete tickets[input[i]];
            } else if (input[i] != ZEROLEAF) {
                driverDeposits++;
            }
        }
        if (driverDeposits > 0) {
            token.safeTransferFrom(
                msg.sender,
                address(this),
                depositAmount * driverDeposits
            );
        }
        token.approve(
            address(hush),
            (deposits + driverDeposits) * depositAmount
        );
        require(hush.multiDeposit(proof, input), "Multideposit failed");
        token.safeTransfer(msg.sender, token.balanceOf(address(this)));
    }
}
