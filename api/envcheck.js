export default function handler(req, res) {
  res.status(200).json({
    NEWTON_API_KEY: Boolean(process.env.NEWTON_API_KEY),
    NEWTON_POLICY_CLIENT: Boolean(process.env.NEWTON_POLICY_CLIENT),
    DEMO_PRIVATE_KEY: Boolean(process.env.DEMO_PRIVATE_KEY),
    ETHERSCAN_API_KEY: Boolean(process.env.ETHERSCAN_API_KEY),
  });
}
