<?php
// Minimal WordPress harness: exercises the registered REST authentication filter.
define('ABSPATH', __DIR__);
if (getenv('TEST_SECRET_CONFIGURED')) define('IS_PRESENTON_AI_SECRET', str_repeat('s', 40));
$GLOBALS['filters'] = array();
function add_filter($hook, $callback, $priority, $count) { $GLOBALS['filters'][$hook] = $callback; }
function add_action(...$args) {}
function is_multisite() { return true; }
function current_user_can($cap) { return !empty($GLOBALS['admin']) && $cap === 'manage_network_options'; }
function untrailingslashit($value) { return rtrim($value, '/'); }
class WP_Error { public $data; function __construct($code,$message,$data) { $this->data=$data; } }
class Request { function __construct(public $route,public $params=array()) {} function get_route(){return $this->route;} function get_param($name){return $this->params[$name]??null;} }
require __DIR__.'/../../integrations/wordpress/presenton-security-guard.php';
$f=$GLOBALS['filters']['rest_pre_dispatch'];
function expect_status($value,$status) { if (!($value instanceof WP_Error) || $value->data['status']!==$status) throw new Exception('Unexpected permission result'); }
expect_status($f(null,null,new Request('/is-ai/v1/presenton-log')),401);
expect_status($f(null,null,new Request('/is-ai/v1/presenton-log',array('secret'=>'wrong'))),401);
expect_status($f(null,null,new Request('/digital-launchpad/v1/proxy')),403);
$GLOBALS['admin']=true;
if ($f(null,null,new Request('/digital-launchpad/v1/proxy'))!==null) throw new Exception('Administrator blocked');
if (defined('IS_PRESENTON_AI_SECRET')) {
 expect_status($f(null,null,new Request('/is-ai/v1/presenton-log',array('secret'=>IS_PRESENTON_AI_SECRET,'tokens'=>-1,'usd_cost'=>1))),400);
 if ($f(null,null,new Request('/is-ai/v1/presenton-log',array('secret'=>IS_PRESENTON_AI_SECRET,'tokens'=>10,'usd_cost'=>0.01)))!==null) throw new Exception('Trusted callback blocked');
}
echo "PASS WordPress guard authentication\n";
