import type { CharacterAsset, EnvironmentAsset } from "../../types/style";

type Asset = CharacterAsset | EnvironmentAsset;

export default function AssetList({
  assets,
  onApprove,
  working,
}: {
  assets: Asset[];
  onApprove: (asset: Asset) => void;
  working: boolean;
}) {
  if (assets.length === 0) return <p>No assets yet. New assets are appended to the record history.</p>;

  return (
    <div>
      {assets.map((asset) => (
        <article key={asset.id}>
          {asset.signed_url ? (
            <img src={asset.signed_url} alt={asset.label} style={{ maxWidth: "220px", display: "block" }} />
          ) : (
            <p>Asset preview unavailable.</p>
          )}
          <strong>{asset.label}</strong>
          <p>Status: {asset.status}</p>
          <p>Stored at: {asset.storage_path}</p>
          {asset.status !== "approved" && (
            <button disabled={working} onClick={() => void onApprove(asset)}>
              Approve Asset
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
