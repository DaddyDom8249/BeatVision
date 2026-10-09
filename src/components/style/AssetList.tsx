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
  const mediaType = typeof asset.metadata?.mime_type === "string" ? asset.metadata.mime_type : "";
  const isHeif = /^image\/hei[cf]$/i.test(mediaType) || /\.(heif|heic)$/i.test(asset.label);
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
    <article className="style-asset-card">
      {asset.signed_url && !previewFailed ? (
        <img
          src={asset.signed_url}
          alt={`Reference preview: ${asset.label}`}
          loading="lazy"
          onError={() => setPreviewFailed(true)}
          style={{ maxWidth: "220px", display: "block" }}
        />
      ) : (
        isHeif ? (
          <p role="status">HEIF/HEIC reference saved, but this browser could not display its preview. Refreshing the secure link will not convert the file. For a visible reference, upload a JPEG or PNG separately; the original record stays unchanged.</p>
        ) : (
          <p role="status">Reference preview unavailable or its secure link expired. The uploaded record is still saved.</p>
        )
      )}
      {(previewFailed || !asset.signed_url) && onRefresh && !isHeif && (
        <button type="button" disabled={working} onClick={refresh}>
          Refresh image preview
        </button>
      )}
      {refreshError && <p role="alert" className="form-error">{refreshError}</p>}
      <strong>{asset.label}</strong>
      <p>Status: {asset.status}</p>
      <details className="style-asset-storage"><summary>Storage details</summary><code>{asset.storage_path}</code></details>
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
    <div className="style-asset-list">
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
