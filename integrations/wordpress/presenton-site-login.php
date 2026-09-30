<?php
// Included by Presenton Security Guard. Authorization always uses live membership.
if (!defined('ABSPATH')) { exit; }
function presenton_site_access($user_id, $site_id) {
    $site = get_site($site_id);
    if (!$site || $site->deleted || $site->spam || $site->archived) { return false; }
    if (is_super_admin($user_id)) { return true; }
    if (!is_user_member_of_blog($user_id, $site_id)) { return false; }
    switch_to_blog($site_id);
    try { return user_can($user_id, 'manage_options'); }
    finally { restore_current_blog(); }
}
function presenton_customer_enabled() { return (bool) get_site_option('presenton_customer_access_enabled', false); }
function presenton_login_option_name($kind, $value) { return 'presenton_' . $kind . '_' . hash('sha256', $value); }
function presenton_identity_error() { return new WP_Error('presenton_access_denied', 'Site access denied', array('status'=>403)); }

add_action('admin_post_nopriv_presenton_studio_authorize', function () {
    auth_redirect();
});
add_action('admin_post_presenton_studio_authorize', function () {
    if (!presenton_customer_enabled()) { wp_die('Customer access is not enabled.', '', array('response'=>403)); }
    $site = isset($_GET['site']) ? absint($_GET['site']) : 0;
    $state = isset($_GET['state']) && is_string($_GET['state']) ? wp_unslash($_GET['state']) : '';
    $challenge = isset($_GET['challenge']) && is_string($_GET['challenge']) ? wp_unslash($_GET['challenge']) : '';
    if (!preg_match('/^[a-f0-9]{48}$/D', $state) || !preg_match('/^[A-Za-z0-9_-]{43}$/D', $challenge) || !presenton_site_access(get_current_user_id(), $site)) {
        wp_die('Site access denied.', '', array('response'=>403));
    }
    $origin = rtrim((string) get_site_option('presenton_security_origin', ''), '/');
    $parts = wp_parse_url($origin);
    if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || !empty($parts['path']) || !empty($parts['query']) || !empty($parts['user']) || !empty($parts['fragment'])) { wp_die('Studio origin is not configured.'); }
    $code = bin2hex(random_bytes(32));
    switch_to_blog(get_main_site_id());
    try { add_option(presenton_login_option_name('code', $code), array('site'=>$site,'user'=>get_current_user_id(),'wp_session'=>wp_get_session_token(),'challenge'=>$challenge,'expires'=>time()+120), '', false); }
    finally { restore_current_blog(); }
    nocache_headers(); header('Referrer-Policy: no-referrer');
    wp_redirect($origin . '/auth/callback?' . http_build_query(array('code'=>$code,'state'=>$state)),302,'Presenton'); exit;
});

add_action('rest_api_init', function () {
    register_rest_route('presenton-security/v1', '/exchange', array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>function ($request) {
        $code=$request->get_param('code'); $verifier=$request->get_param('verifier');
        if (!presenton_customer_enabled() || !is_string($code) || !preg_match('/^[a-f0-9]{64}$/D',$code) || !is_string($verifier) || !preg_match('/^[A-Za-z0-9_-]{43}$/D',$verifier)) { return presenton_identity_error(); }
        switch_to_blog(get_main_site_id());
        try {
            $name=presenton_login_option_name('code',$code); $record=get_option($name);
            $challenge=rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=');
            if (!is_array($record) || $record['expires']<time() || !hash_equals($record['challenge'],$challenge) || (!presenton_site_access($record['user'],$record['site']) || !WP_Session_Tokens::get_instance($record['user'])->verify($record['wp_session'] ?? ''))) { return presenton_identity_error(); }
            // Atomic consume: two simultaneous exchanges cannot both succeed.
            global $wpdb;
            $deleted=$wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s",$name,maybe_serialize($record)));
            wp_cache_delete($name,'options');
            if ($deleted !== 1) { return presenton_identity_error(); }
            $ticket=bin2hex(random_bytes(32));
            set_transient(presenton_login_option_name('session',$ticket),array('site'=>$record['site'],'user'=>$record['user'],'wp_session'=>$record['wp_session']),8*HOUR_IN_SECONDS);
            return new WP_REST_Response(array('ticket'=>$ticket,'site'=>$record['site'],'user'=>$record['user']),200,array('Cache-Control'=>'no-store'));
        } finally { restore_current_blog(); }
    }));
    foreach (array('session','logout') as $operation) {
        register_rest_route('presenton-security/v1','/'.$operation,array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>function ($request) use ($operation) {
            $ticket=$request->get_param('ticket');
            if (!presenton_customer_enabled() || !is_string($ticket) || !preg_match('/^[a-f0-9]{64}$/D',$ticket)) { return presenton_identity_error(); }
            switch_to_blog(get_main_site_id());
            try {
                $name=presenton_login_option_name('session',$ticket); $record=get_transient($name);
                if ($operation==='logout') { delete_transient($name); return new WP_REST_Response(array('ok'=>true),200,array('Cache-Control'=>'no-store')); }
                if (!is_array($record) || (!presenton_site_access($record['user'],$record['site']) || !WP_Session_Tokens::get_instance($record['user'])->verify($record['wp_session'] ?? ''))) { return presenton_identity_error(); }
                return new WP_REST_Response(array('site'=>$record['site'],'user'=>$record['user']),200,array('Cache-Control'=>'no-store'));
            } finally { restore_current_blog(); }
        }));
    }
});
