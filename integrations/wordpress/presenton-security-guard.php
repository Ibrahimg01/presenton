<?php
/**
 * Plugin Name: Presenton Security Guard
 * Description: Administrator-only Launchpad access and authenticated server-side usage reporting.
 * Version: 2.0.1
 * Network: true
 */
if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/presenton-site-login.php';

function presenton_security_is_admin() {
    return is_multisite() ? current_user_can('manage_network_options') : current_user_can('manage_options');
}

// Runs before the original callback, including when its shared secret is unset.
add_filter('rest_pre_dispatch', function ($result, $server, $request) {
    $route = untrailingslashit($request->get_route());
    if ($route === '/is-ai/v1/presenton-log') {
        $expected = defined('IS_PRESENTON_AI_SECRET') ? (string) IS_PRESENTON_AI_SECRET : '';
        $provided = $request->get_param('secret');
        if (strlen($expected) < 32 || !is_string($provided) || !hash_equals($expected, $provided)) {
            return new WP_Error('presenton_unauthorized', 'Usage callback authentication required', array('status' => 401));
        }
        $tokens = $request->get_param('tokens');
        $cost = $request->get_param('usd_cost');
        if (!is_numeric($tokens) || !is_numeric($cost) || (float) $tokens < 0 || (float) $cost < 0 || !is_finite((float) $cost)) {
            return new WP_Error('presenton_invalid_usage', 'Invalid usage values', array('status' => 400));
        }
    } elseif (strpos($route, '/digital-launchpad/v1/') === 0 && (presenton_customer_enabled() || !presenton_security_is_admin())) {
        return new WP_Error('presenton_forbidden', 'Administrator access required', array('status' => 403));
    }
    return $result;
}, 1, 3);

// Replace the legacy iframe callback instead of rendering a secret-bearing URL.
add_action('admin_menu', function () {
    remove_all_actions('toplevel_page_digital-launchpad');
    add_action('toplevel_page_digital-launchpad', function () {
        if (!(presenton_customer_enabled() ? presenton_site_access(get_current_user_id(), get_current_blog_id()) : presenton_security_is_admin())) { wp_die('Site administrator access required', '', array('response' => 403)); }
        $origin = defined('IS_PRESENTON_ORIGIN') ? rtrim(IS_PRESENTON_ORIGIN, '/') : rtrim((string) get_site_option('presenton_security_origin', ''), '/');
        $parts = wp_parse_url($origin);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || !empty($parts['user']) || !empty($parts['pass']) || !empty($parts['query']) || !empty($parts['fragment']) || !empty($parts['path'])) {
            echo '<div class="wrap"><h1>Presentation Studio</h1><p>Configure the secure Presenton origin on the server.</p></div>';
            return;
        }
        $url = presenton_customer_enabled() ? add_query_arg('site', get_current_blog_id(), $origin . '/auth/start') : add_query_arg('tenant', get_current_blog_id(), $origin . '/upload');
        echo '<div class="wrap"><h1>Presentation Studio</h1><p>Open your site’s protected presentation studio.</p><a class="button button-primary" target="_blank" rel="noopener noreferrer" href="' . esc_url($url) . '">Open Presentation Studio</a></div>';
    });
}, PHP_INT_MAX);

// Remove the old browser proxy and its localized nonce/secret entirely. The
// protected application calls its own backend and reports usage server-to-server.
add_action('admin_enqueue_scripts', function ($hook) {
    if ($hook !== 'toplevel_page_digital-launchpad') { return; }
    wp_dequeue_script('dl-proxy-interceptor');
    wp_deregister_script('dl-proxy-interceptor');
}, PHP_INT_MAX);

// The public studio origin is configuration, never a provider credential.
add_action('network_admin_menu', function () {
    add_submenu_page('settings.php', 'Presenton Security', 'Presenton Security', 'manage_network_options', 'presenton-security', function () {
        if (!presenton_security_is_admin()) { wp_die('Administrator access required', '', array('response' => 403)); }
        $message = '';
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
            check_admin_referer('presenton_security_origin');
            $value = isset($_POST['presenton_origin']) && is_string($_POST['presenton_origin']) ? rtrim(trim(wp_unslash($_POST['presenton_origin'])), '/') : '';
            $parts = wp_parse_url($value);
            if ($parts && ($parts['scheme'] ?? '') === 'https' && !empty($parts['host']) && empty($parts['user']) && empty($parts['pass']) && empty($parts['query']) && empty($parts['fragment']) && empty($parts['path'])) {
                update_site_option('presenton_security_origin', $value);
                update_site_option('presenton_customer_access_enabled', !empty($_POST['presenton_customer_access']));
                $message = 'Studio access settings saved.';
            } else { $message = 'Enter an HTTPS origin without a path, credentials or query.'; }
        }
        echo '<div class="wrap"><h1>Presenton Security</h1>';
        if ($message) { echo '<p>' . esc_html($message) . '</p>'; }
        echo '<p>Customer mode permits each site’s administrators to use that site’s studio. Enable only after the site-isolated server deployment is ready.</p><form method="post">';
        wp_nonce_field('presenton_security_origin');
        echo '<p><label for="presenton_origin">Protected studio address</label></p><input class="regular-text" type="url" name="presenton_origin" id="presenton_origin" required value="' . esc_attr(get_site_option('presenton_security_origin', '')) . '">';
        echo '<p><label><input type="checkbox" name="presenton_customer_access" value="1" ' . checked(presenton_customer_enabled(), true, false) . '> Enable site administrator access</label></p>';
        submit_button('Save studio address');
        echo '</form></div>';
    });
});
