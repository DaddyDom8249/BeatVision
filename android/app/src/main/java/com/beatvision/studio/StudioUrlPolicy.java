package com.beatvision.studio;

import java.net.URI;
import java.net.URISyntaxException;

/** Strict top-level navigation allowlist. No subdomain or prefix matching. */
public final class StudioUrlPolicy {
    public static final String HOME = "https://beat-vision-theta.vercel.app/";

    private StudioUrlPolicy() { }

    public static boolean isStudioUrl(String candidate) {
        if (candidate == null) return false;
        try {
            URI uri = new URI(candidate);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && "beat-vision-theta.vercel.app".equalsIgnoreCase(uri.getHost())
                    && uri.getRawUserInfo() == null
                    && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (URISyntaxException | IllegalArgumentException ex) {
            return false;
        }
    }

    public static boolean isExternalWebUrl(String candidate) {
        if (candidate == null) return false;
        try {
            URI uri = new URI(candidate);
            String scheme = uri.getScheme();
            return ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                    && uri.getHost() != null
                    && uri.getRawUserInfo() == null;
        } catch (URISyntaxException | IllegalArgumentException ex) {
            return false;
        }
    }
}
