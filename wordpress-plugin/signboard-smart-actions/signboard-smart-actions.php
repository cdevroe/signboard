<?php
/**
 * Plugin Name: Signboard Smart Action Sharing
 * Description: Adds a stateless landing page for previewing and downloading shared Signboard Smart Actions.
 * Version: 0.1.0
 * Author: Colin Devroe
 * Author URI: https://cdevroe.com/
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SIGNBOARD_SMART_ACTION_SHARING_VERSION', '0.1.0');

function signboard_smart_action_sharing_shortcode() {
    $asset_url = plugin_dir_url(__FILE__);
    wp_enqueue_style(
        'signboard-smart-action-sharing',
        $asset_url . 'assets/share.css',
        array(),
        SIGNBOARD_SMART_ACTION_SHARING_VERSION
    );
    wp_enqueue_script(
        'signboard-smart-action-sharing',
        $asset_url . 'assets/share.js',
        array(),
        SIGNBOARD_SMART_ACTION_SHARING_VERSION,
        true
    );

    ob_start();
    ?>
    <section class="signboard-action-share" data-signboard-action-share>
        <div class="signboard-action-share__eyebrow">Signboard Smart Action</div>
        <div class="signboard-action-share__state" data-signboard-action-state>
            <h1 data-signboard-action-title>Open a shared Smart Action</h1>
            <p data-signboard-action-description>Use a Smart Action link copied from Signboard to preview it here.</p>
        </div>
        <dl class="signboard-action-share__metadata" data-signboard-action-metadata hidden>
            <div><dt>Scope</dt><dd data-signboard-action-scope></dd></div>
            <div><dt>Behavior</dt><dd data-signboard-action-behavior></dd></div>
        </dl>
        <details class="signboard-action-share__prompt" data-signboard-action-prompt-wrap hidden>
            <summary>Review prompt</summary>
            <pre data-signboard-action-prompt></pre>
        </details>
        <div class="signboard-action-share__notice" data-signboard-action-notice>
            The action is stored only in the part of the link after #. This page does not upload or save it.
        </div>
        <div class="signboard-action-share__actions">
            <button type="button" data-signboard-action-download hidden>Download Action</button>
            <button type="button" data-signboard-action-share-button hidden>Share Link</button>
            <a href="<?php echo esc_url(home_url('/signboard/')); ?>">Get Signboard</a>
        </div>
        <p class="signboard-action-share__status" data-signboard-action-status aria-live="polite"></p>
    </section>
    <?php
    return ob_get_clean();
}
add_shortcode('signboard_smart_action_importer', 'signboard_smart_action_sharing_shortcode');

