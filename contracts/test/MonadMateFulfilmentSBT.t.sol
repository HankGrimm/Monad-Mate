// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MonadMateFulfilmentSBT} from "../src/MonadMateFulfilmentSBT.sol";

contract MonadMateFulfilmentSBTTest is Test {
    MonadMateFulfilmentSBT internal sbt;

    address internal admin = address(0xA11CE);
    address internal holder = address(0xB0B);
    address internal other = address(0xCAFE);

    bytes32 internal constant ATTESTATION = bytes32("attest-1");
    bytes32 internal constant VENUE = bytes32("mall");
    bytes32 internal constant SCENE = bytes32("dining");

    function setUp() public {
        sbt = new MonadMateFulfilmentSBT(admin, "https://monadmate.xyz/credentials/");
    }

    function _mint(address to, bytes32 attestation) internal returns (uint256) {
        vm.prank(admin);
        return sbt.mint(
            to, attestation, VENUE, SCENE, uint64(block.timestamp), 60, MonadMateFulfilmentSBT.Outcome.Kept
        );
    }

    // -----------------------------------------------------------------------
    // Minting
    // -----------------------------------------------------------------------

    function test_mint_assignsTokenToHolder() public {
        uint256 tokenId = _mint(holder, ATTESTATION);

        assertEq(tokenId, 1);
        assertEq(sbt.ownerOf(tokenId), holder);
        assertEq(sbt.balanceOf(holder), 1);
        assertEq(sbt.totalSupply(), 1);
    }

    function test_mint_storesPrivacySafeMetadata() public {
        uint256 tokenId = _mint(holder, ATTESTATION);
        MonadMateFulfilmentSBT.Credential memory cred = sbt.credentialOf(tokenId);

        assertEq(cred.venueType, VENUE);
        assertEq(cred.scene, SCENE);
        assertEq(cred.durationMinutes, 60);
        assertEq(uint8(cred.outcome), uint8(MonadMateFulfilmentSBT.Outcome.Kept));
        // Only the holder is recorded — there is no counterparty field at all.
        assertEq(cred.holder, holder);
    }

    function test_mint_onlyAdmin() public {
        vm.prank(other);
        vm.expectRevert(MonadMateFulfilmentSBT.Unauthorized.selector);
        sbt.mint(holder, ATTESTATION, VENUE, SCENE, uint64(block.timestamp), 60, MonadMateFulfilmentSBT.Outcome.Kept);
    }

    function test_mint_rejectsDuplicateAttestation() public {
        _mint(holder, ATTESTATION);

        vm.prank(admin);
        vm.expectRevert(MonadMateFulfilmentSBT.CredentialAlreadyMinted.selector);
        sbt.mint(holder, ATTESTATION, VENUE, SCENE, uint64(block.timestamp), 60, MonadMateFulfilmentSBT.Outcome.Kept);
    }

    function test_mint_rejectsZeroHolder() public {
        vm.prank(admin);
        vm.expectRevert(MonadMateFulfilmentSBT.ZeroAddress.selector);
        sbt.mint(
            address(0), ATTESTATION, VENUE, SCENE, uint64(block.timestamp), 60, MonadMateFulfilmentSBT.Outcome.Kept
        );
    }

    // -----------------------------------------------------------------------
    // Soulbound enforcement
    // -----------------------------------------------------------------------

    function test_transferFrom_reverts() public {
        uint256 tokenId = _mint(holder, ATTESTATION);

        vm.prank(holder);
        vm.expectRevert(MonadMateFulfilmentSBT.SoulboundTransferRejected.selector);
        sbt.transferFrom(holder, other, tokenId);
    }

    function test_safeTransferFrom_reverts() public {
        uint256 tokenId = _mint(holder, ATTESTATION);

        vm.prank(holder);
        vm.expectRevert(MonadMateFulfilmentSBT.SoulboundTransferRejected.selector);
        sbt.safeTransferFrom(holder, other, tokenId);
    }

    function test_approve_reverts() public {
        uint256 tokenId = _mint(holder, ATTESTATION);

        vm.prank(holder);
        vm.expectRevert(MonadMateFulfilmentSBT.SoulboundTransferRejected.selector);
        sbt.approve(other, tokenId);
    }

    function test_setApprovalForAll_reverts() public {
        vm.prank(holder);
        vm.expectRevert(MonadMateFulfilmentSBT.SoulboundTransferRejected.selector);
        sbt.setApprovalForAll(other, true);
    }

    function test_approvalViewsAlwaysEmpty() public {
        uint256 tokenId = _mint(holder, ATTESTATION);
        assertEq(sbt.getApproved(tokenId), address(0));
        assertFalse(sbt.isApprovedForAll(holder, other));
    }

    // -----------------------------------------------------------------------
    // Arbitration correction
    // -----------------------------------------------------------------------

    function test_correctOutcome_updatesRecord() public {
        uint256 tokenId = _mint(holder, ATTESTATION);

        vm.prank(admin);
        sbt.correctOutcome(tokenId, MonadMateFulfilmentSBT.Outcome.NoShow, "arbitration overturned");

        assertEq(uint8(sbt.credentialOf(tokenId).outcome), uint8(MonadMateFulfilmentSBT.Outcome.NoShow));
    }

    function test_correctOutcome_onlyAdmin() public {
        uint256 tokenId = _mint(holder, ATTESTATION);

        vm.prank(other);
        vm.expectRevert(MonadMateFulfilmentSBT.Unauthorized.selector);
        sbt.correctOutcome(tokenId, MonadMateFulfilmentSBT.Outcome.NoShow, "nope");
    }

    function test_correctOutcome_unknownTokenReverts() public {
        vm.prank(admin);
        vm.expectRevert(MonadMateFulfilmentSBT.UnknownToken.selector);
        sbt.correctOutcome(42, MonadMateFulfilmentSBT.Outcome.NoShow, "missing");
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function test_keptCount_excludesNoShows() public {
        _mint(holder, bytes32("a-1"));
        _mint(holder, bytes32("a-2"));
        uint256 third = _mint(holder, bytes32("a-3"));

        vm.prank(admin);
        sbt.correctOutcome(third, MonadMateFulfilmentSBT.Outcome.NoShow, "no show");

        assertEq(sbt.balanceOf(holder), 3);
        assertEq(sbt.keptCount(holder), 2);
    }

    function test_tokenURI_appendsTokenId() public {
        uint256 tokenId = _mint(holder, ATTESTATION);
        assertEq(sbt.tokenURI(tokenId), "https://monadmate.xyz/credentials/1");
    }

    function test_tokenURI_unknownTokenReverts() public {
        vm.expectRevert(MonadMateFulfilmentSBT.UnknownToken.selector);
        sbt.tokenURI(99);
    }

    function test_setBaseURI_onlyAdmin() public {
        vm.prank(other);
        vm.expectRevert(MonadMateFulfilmentSBT.Unauthorized.selector);
        sbt.setBaseURI("https://evil.example/");
    }

    function test_supportsInterface() public view {
        assertTrue(sbt.supportsInterface(0x01ffc9a7)); // ERC-165
        assertTrue(sbt.supportsInterface(0x5b5e139f)); // ERC-721 Metadata
        assertFalse(sbt.supportsInterface(0xffffffff));
    }

    function test_transferAdmin() public {
        vm.prank(admin);
        sbt.transferAdmin(other);
        assertEq(sbt.admin(), other);
    }
}
