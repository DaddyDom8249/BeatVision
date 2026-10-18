package com.beatvision.studio;

import static org.junit.Assert.*;
import org.junit.Test;

public class StudioUrlPolicyTest {
    @Test public void acceptsOnlyExactHttpsProductionHost() {
        assertTrue(StudioUrlPolicy.isStudioUrl("https://beat-vision-theta.vercel.app/"));
        assertTrue(StudioUrlPolicy.isStudioUrl("https://beat-vision-theta.vercel.app/projects/new"));
        assertTrue(StudioUrlPolicy.isStudioUrl("https://BEAT-VISION-THETA.VERCEL.APP:443/auth"));
        assertFalse(StudioUrlPolicy.isStudioUrl("http://beat-vision-theta.vercel.app/"));
        assertFalse(StudioUrlPolicy.isStudioUrl("https://beat-vision-theta.vercel.app.evil.test/"));
        assertFalse(StudioUrlPolicy.isStudioUrl("https://beat-vision-theta.vercel.app@evil.test/"));
        assertFalse(StudioUrlPolicy.isStudioUrl("https://evil.test@beat-vision-theta.vercel.app/"));
        assertFalse(StudioUrlPolicy.isStudioUrl("https://beat-vision-theta.vercel.app:8443/"));
        assertFalse(StudioUrlPolicy.isStudioUrl("javascript:alert(1)"));
        assertFalse(StudioUrlPolicy.isStudioUrl(null));
    }

    @Test public void externalBrowserAllowsOnlyOrdinaryWebOrigins() {
        assertTrue(StudioUrlPolicy.isExternalWebUrl("https://example.org/watch"));
        assertTrue(StudioUrlPolicy.isExternalWebUrl("https://mdofsinyofqbeapzfygu.supabase.co/storage/v1/object/sign/file"));
        assertFalse(StudioUrlPolicy.isExternalWebUrl("intent://evil"));
        assertFalse(StudioUrlPolicy.isExternalWebUrl("file:///etc/passwd"));
        assertFalse(StudioUrlPolicy.isExternalWebUrl("data:text/html,hi"));
        assertFalse(StudioUrlPolicy.isExternalWebUrl("https://user:secret@example.org/"));
        assertFalse(StudioUrlPolicy.isExternalWebUrl("https:///missing-host"));
    }
}
