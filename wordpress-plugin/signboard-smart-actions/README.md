# Signboard Smart Action Sharing

This WordPress plugin provides the stateless landing page used by Signboard Smart Action share links.

## Install

1. Copy `signboard-smart-actions` into `wp-content/plugins/` and activate **Signboard Smart Action Sharing**.
2. Create a WordPress page at `/signboard/actions/` (an `actions` child page beneath the existing Signboard page works well).
3. Put this shortcode in the page content:

   `[signboard_smart_action_importer]`

Signboard share links use `https://cdevroe.com/signboard/actions/#signboard-action-v1:...`.

The encoded action stays in the URL fragment. Browsers do not include fragments in HTTP requests, so WordPress does not receive or store the prompt. The plugin has no database tables, AJAX endpoints, REST routes, cookies, or marketplace directory.

Recipients can review the prompt, download a `.signboard-action` file, and import it from Signboard’s Smart Actions settings.

