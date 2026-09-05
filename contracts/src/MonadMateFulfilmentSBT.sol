// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Monad Mate Fulfilment Credential (Soulbound)
/// @notice Non-transferable ERC-721-shaped credential recording that a holder
///         kept (or broke) one offline meetup commitment. Implements R8 of the
///         product spec.
/// @dev Deliberately *not* a full ERC-721: every transfer entrypoint reverts,
///      so wallets and marketplaces cannot move or list these tokens. The
///      metadata written on-chain carries no counterparty identity — only the
///      venue category, scene, timestamp and outcome.
contract MonadMateFulfilmentSBT {
    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    enum Outcome {
        Kept,
        NoShow,
        Disputed
    }

    struct Credential {
        address holder;
        bytes32 venueType; // "mall" / "supermarket"
        bytes32 scene; // "dining" / "entertainment" / "shopping"
        uint64 occurredAt;
        uint32 durationMinutes;
        Outcome outcome;
    }

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    string public name = "Monad Mate Fulfilment Credential";
    string public symbol = "MMFC";

    /// @notice Backend authority allowed to mint and to correct outcomes.
    address public admin;

    /// @notice Base URI for off-chain metadata; tokenURI appends the token id.
    string public baseURI;

    uint256 public totalSupply;

    mapping(uint256 => Credential) private _credentials;
    mapping(address => uint256[]) private _tokensOf;
    /// @dev Off-chain attestation id => token id, so a meetup can only ever
    ///      mint one credential per holder.
    mapping(bytes32 => uint256) public tokenByAttestation;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    /// @dev ERC-721 `Transfer` shape with `from == address(0)` so indexers and
    ///      explorers still recognise the mint, even though transfers are
    ///      impossible afterwards.
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event CredentialMinted(
        uint256 indexed tokenId,
        address indexed holder,
        bytes32 indexed attestationRef,
        bytes32 venueType,
        bytes32 scene,
        Outcome outcome
    );
    event OutcomeCorrected(uint256 indexed tokenId, Outcome previousOutcome, Outcome newOutcome, string reason);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event BaseURIUpdated(string newBaseURI);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error Unauthorized();
    error ZeroAddress();
    error SoulboundTransferRejected();
    error CredentialAlreadyMinted();
    error UnknownToken();

    constructor(address admin_, string memory baseURI_) {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
        baseURI = baseURI_;
        emit AdminTransferred(address(0), admin_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function setBaseURI(string calldata newBaseURI) external onlyAdmin {
        baseURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    // -----------------------------------------------------------------------
    // Minting
    // -----------------------------------------------------------------------

    /// @notice Mint one credential to `holder`.
    /// @param attestationRef Off-chain attestation identifier, used to make
    ///        minting idempotent per meetup.
    function mint(
        address holder,
        bytes32 attestationRef,
        bytes32 venueType,
        bytes32 scene,
        uint64 occurredAt,
        uint32 durationMinutes,
        Outcome outcome
    ) external onlyAdmin returns (uint256 tokenId) {
        if (holder == address(0)) revert ZeroAddress();
        if (tokenByAttestation[attestationRef] != 0) revert CredentialAlreadyMinted();

        tokenId = ++totalSupply;
        _credentials[tokenId] = Credential({
            holder: holder,
            venueType: venueType,
            scene: scene,
            occurredAt: occurredAt,
            durationMinutes: durationMinutes,
            outcome: outcome
        });
        _tokensOf[holder].push(tokenId);
        tokenByAttestation[attestationRef] = tokenId;

        emit Transfer(address(0), holder, tokenId);
        emit CredentialMinted(tokenId, holder, attestationRef, venueType, scene, outcome);
    }

    /// @notice Correct an outcome after arbitration.
    /// @dev Soulbound records must still be *correctable* — an immutable wrong
    ///      verdict would be worse than no record. History stays auditable via
    ///      the emitted event rather than by keeping the stale value on-chain.
    function correctOutcome(uint256 tokenId, Outcome newOutcome, string calldata reason) external onlyAdmin {
        Credential storage cred = _credentials[tokenId];
        if (cred.holder == address(0)) revert UnknownToken();

        Outcome previous = cred.outcome;
        cred.outcome = newOutcome;
        emit OutcomeCorrected(tokenId, previous, newOutcome, reason);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function ownerOf(uint256 tokenId) external view returns (address) {
        address holder = _credentials[tokenId].holder;
        if (holder == address(0)) revert UnknownToken();
        return holder;
    }

    function balanceOf(address holder) external view returns (uint256) {
        return _tokensOf[holder].length;
    }

    function tokensOf(address holder) external view returns (uint256[] memory) {
        return _tokensOf[holder];
    }

    function credentialOf(uint256 tokenId) external view returns (Credential memory) {
        Credential memory cred = _credentials[tokenId];
        if (cred.holder == address(0)) revert UnknownToken();
        return cred;
    }

    /// @notice Number of credentials with a `Kept` outcome — the on-chain
    ///         equivalent of "how many times did this person show up".
    function keptCount(address holder) external view returns (uint256 count) {
        uint256[] storage ids = _tokensOf[holder];
        for (uint256 i = 0; i < ids.length; i++) {
            if (_credentials[ids[i]].outcome == Outcome.Kept) count++;
        }
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_credentials[tokenId].holder == address(0)) revert UnknownToken();
        return string.concat(baseURI, _toString(tokenId));
    }

    /// @dev ERC-165: ERC-721 metadata interface id is advertised for wallet
    ///      display, but transfer functions revert (see below).
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC-165
            || interfaceId == 0x5b5e139f; // ERC-721 Metadata
    }

    // -----------------------------------------------------------------------
    // Soulbound enforcement — every transfer path reverts
    // -----------------------------------------------------------------------

    function transferFrom(address, address, uint256) external pure {
        revert SoulboundTransferRejected();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert SoulboundTransferRejected();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert SoulboundTransferRejected();
    }

    function approve(address, uint256) external pure {
        revert SoulboundTransferRejected();
    }

    function setApprovalForAll(address, bool) external pure {
        revert SoulboundTransferRejected();
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 temp = value; temp != 0; temp /= 10) {
            digits++;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
