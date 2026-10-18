package com.beatvision.studio;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceError;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

/**
 * Thin Android host for the existing BeatVision studio.
 * All projects, authentication, media jobs, and approvals remain server-owned.
 * No JavaScript bridge or service-role credentials are exposed to the WebView.
 */
public final class MainActivity extends Activity {
    private static final int FILE_PICKER_REQUEST = 1701;
    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> fileResult;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xff08080a);
        getWindow().setNavigationBarColor(0xff08080a);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xff08080a);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        progressBar.setVisibility(View.VISIBLE);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP);
        root.addView(progressBar, barParams);
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // The existing React SPA requires JavaScript.
        settings.setDomStorageEnabled(true); // Supabase stores this user's session locally.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Android document picker content URIs.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String next = request.getUrl().toString();
                if (StudioUrlPolicy.isStudioUrl(next)) return false;
                openInBrowser(next);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    Toast.makeText(MainActivity.this,
                            "Studio unavailable. Check your connection and reopen BeatVision.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                try {
                    Intent picker = params.createIntent();
                    picker.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(picker, FILE_PICKER_REQUEST);
                } catch (ActivityNotFoundException | SecurityException ex) {
                    fileResult.onReceiveValue(null);
                    fileResult = null;
                    Toast.makeText(MainActivity.this,
                            "No document picker available.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        // Browser handles signed downloads; never claim they are downloadable
        // until the web app's existing database-driven gate presents a link.
        webView.setDownloadListener((url, userAgent, disposition, type, length) ->
                openInBrowser(url));

        if (savedInstanceState == null) {
            webView.loadUrl(StudioUrlPolicy.HOME);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void openInBrowser(String candidate) {
        if (!StudioUrlPolicy.isExternalWebUrl(candidate)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(candidate))
                    .addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException | SecurityException ex) {
            Toast.makeText(this, "No browser available to open this link.",
                    Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_PICKER_REQUEST || fileResult == null) return;
        Uri[] chosen = resultCode == RESULT_OK
                ? WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                : null;
        if (chosen != null) {
            java.util.ArrayList<Uri> safe = new java.util.ArrayList<>();
            for (Uri uri : chosen) {
                if (uri != null && "content".equalsIgnoreCase(uri.getScheme())) safe.add(uri);
            }
            chosen = safe.isEmpty() ? null : safe.toArray(new Uri[0]);
        }
        fileResult.onReceiveValue(chosen);
        fileResult = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (fileResult != null) {
            fileResult.onReceiveValue(null);
            fileResult = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
