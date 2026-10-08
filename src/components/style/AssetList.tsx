import { useEffect, useState } from "react";
import type { CharacterAsset, EnvironmentAsset } from "../../types/style";

type Asset = CharacterAsset | EnvironmentAsset;

function AssetCard<T extends Asset>({
  asset,
  onApprove,
  onRefresh,
  working,
}: {
  asset: T;
  onApprove: (asset: T) => void;
  onRefresh?: () => Promise<unknown>;
  working: boolean;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setPreviewFailed(false);
    setRefreshError(null);
  }, [asset.signed_url]);

  function refresh() {
    if (!onRefresh) return;
    setRefreshError(null);
    void onRefresh().catch((reason: unknown) => {
      setRefreshError(reason instanceof Error ? reason.message : "Unable to refresh secure image preview.");
    });
  }

  return (
    <article>
      {asset.signed_url && !previewFailed ? (
        <img
          src={asset.signed_url}
          alt={`Reference preview: ${asset.label}`}
          loading="lazy"
          onError={() => setPreviewFailed(true)}
          style={{ maxWidth: "220px", display: "block" }}
        />
      ) : (
        <p role="status">Reference preview unavailable or its secure link expired. The uploaded record is still saved.</p>
      )}
      {(previewFailed || !asset.signed_url) && onRefresh && (
        <button type="button" disabled={working} onClick={refresh}>
          Refresh image preview
        </button>
      )}
      {refreshError && <p role="alert" className="form-error">{refreshError}</p>}
      <strong>{asset.label}</strong>
      <p>Status: {asset.status}</p>
      <p>Stored at: {asset.storage_path}</p>
      {asset.status !== "approved" && (
        <button type="button" disabled={working} onClick={() => onApprove(asset)}>
          Approve Asset
        </button>
      )}
    </article>
  );
}

export default function AssetList<T extends Asset>({
  assets,
  onApprove,
  onRefresh,
  working,
}: {
  assets: T[];
  onApprove: (asset: T) => void;
  onRefresh?: () => Promise<unknown>;
  working: boolean;
}) {
  if (assets.length === 0) return <p>No assets yet. New assets are appended to the record history.</p>;

  return (
    <div>
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onApprove={onApprove}
          onRefresh={onRefresh}
          working={working}
        />
      ))}
    </div>
  );
}
