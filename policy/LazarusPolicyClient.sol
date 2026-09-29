// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The Newton protocol 0.7 policy client interface. The XOR of these
/// seven selectors is 0xf67e14d6, the interface ID the gateway checks for.
interface INewtonPolicyClient {
    struct PolicyConfig {
        bytes policyParams;
        uint32 expireAfter;
    }

    struct PolicySpec {
        address policy;
        PolicyConfig config;
    }

    function getNewtonPolicyTaskManager() external view returns (address);

    function getOwner() external view returns (address);

    function getPolicies() external view returns (PolicySpec[] memory);

    function getPolicyId() external view returns (bytes32);

    function getPolicySetSnapshot()
        external
        view
        returns (bytes32 policyId, uint64 revision, PolicySpec[] memory policies);

    function policyRevision() external view returns (uint64);

    function setPolicies(PolicySpec[] calldata policies) external returns (bytes32 policyId);
}

/// @title LazarusPolicyClient
/// @notice A policy client for the Lazarus exposure demo. One instance per rule:
/// the policy set holds the Lazarus policy with the max_hops and
/// min_exposure_usd for that rule, so the rule is fixed onchain before any
/// evidence is evaluated and the caller picks a client rather than supplying a
/// policy.
contract LazarusPolicyClient is INewtonPolicyClient {
    /// @dev keccak256("newton.policy.set"), the domain separator the protocol
    /// mixes into a policy set's identity.
    bytes32 private constant POLICY_SET_DOMAIN =
        0x671cdd5663cea1dd5f0b42278ce65570194bc54e20449731d2ae86713689de91;

    bytes4 private constant INTERFACE_ID_POLICY_CLIENT = 0xf67e14d6;
    bytes4 private constant INTERFACE_ID_ERC165 = 0x01ffc9a7;

    address private immutable _taskManager;

    address private _owner;
    uint64 private _revision;
    bytes32 private _policyId;
    PolicySpec[] private _policies;

    error NotOwner();
    error EmptyPolicySet();
    error ZeroPolicyAddress();

    event PolicySetUpdated(bytes32 indexed policyId, uint64 revision, uint256 count);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @param taskManager The Newton prover task manager for this chain.
    /// @param initialOwner Must be the wallet behind the Newton API key that
    /// will submit tasks, otherwise the gateway answers 401.
    constructor(address taskManager, address initialOwner) {
        _taskManager = taskManager;
        _owner = initialOwner == address(0) ? msg.sender : initialOwner;
        emit OwnershipTransferred(address(0), _owner);
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    /// @inheritdoc INewtonPolicyClient
    /// @dev The identity is derived the same way the protocol and the SDK derive
    /// it, so getPolicyId() here equals the SDK's precomputePolicyId for the
    /// same client, revision and set.
    function setPolicies(PolicySpec[] calldata policies)
        external
        onlyOwner
        returns (bytes32 policyId)
    {
        uint256 count = policies.length;
        if (count == 0) revert EmptyPolicySet();

        delete _policies;
        for (uint256 i; i < count; ++i) {
            if (policies[i].policy == address(0)) revert ZeroPolicyAddress();
            _policies.push(policies[i]);
        }

        uint64 nextRevision = _revision + 1;
        _revision = nextRevision;
        policyId = keccak256(
            abi.encode(POLICY_SET_DOMAIN, block.chainid, address(this), nextRevision, policies)
        );
        _policyId = policyId;

        emit PolicySetUpdated(policyId, nextRevision, count);
    }

    function getPolicies() external view returns (PolicySpec[] memory) {
        return _policies;
    }

    function getPolicySetSnapshot()
        external
        view
        returns (bytes32 policyId, uint64 revision, PolicySpec[] memory policies)
    {
        return (_policyId, _revision, _policies);
    }

    function getPolicyId() external view returns (bytes32) {
        return _policyId;
    }

    function policyRevision() external view returns (uint64) {
        return _revision;
    }

    function getNewtonPolicyTaskManager() external view returns (address) {
        return _taskManager;
    }

    function getOwner() external view returns (address) {
        return _owner;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == INTERFACE_ID_POLICY_CLIENT || interfaceId == INTERFACE_ID_ERC165;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previous = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }
}
