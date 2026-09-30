<?php
// Standalone regression harness: no WordPress database or production users touched.
define('ABSPATH',__DIR__);define('HOUR_IN_SECONDS',3600);
$actions=[];$routes=[];$blog=1;$options=[];$transients=[];$enabled=true;$roles=[7=>[1=>true],8=>[2=>true]];
function add_action($hook,$callback){global $actions;$actions[$hook]=$callback;}
function register_rest_route($namespace,$route,$args){global $routes;$routes[$route]=$args['callback'];}
function wp_parse_url($url){return parse_url($url);}
function get_admin_url($site,$path='', $scheme='https'){return 'https://site'.$site.'.example/wp-admin/'.$path;}
function get_site($id){return in_array($id,[1,2])?(object)['deleted'=>false,'spam'=>false,'archived'=>false]:false;}
function is_super_admin($id){return $id===9;}
function is_user_member_of_blog($user,$site){global $roles;return isset($roles[$user][$site]);}
function switch_to_blog($id){global $blog,$stack;$stack[]=$blog;$blog=$id;}
function restore_current_blog(){global $blog,$stack;$blog=array_pop($stack);}
function user_can($user,$cap){global $roles,$blog;return $roles[$user][$blog]??false;}
function get_site_option($key,$default=false){global $enabled;return $key==='presenton_customer_access_enabled'?$enabled:$default;}
function get_main_site_id(){return 1;}
function get_option($key){global $options;return $options[$key]??false;}
function maybe_serialize($value){return serialize($value);}
function wp_cache_delete($key,$group){}
function set_transient($key,$value,$ttl){global $transients;$transients[$key]=$value;}
function get_transient($key){global $transients;return $transients[$key]??false;}
function delete_transient($key){global $transients;unset($transients[$key]);}
class WP_Session_Tokens {static function get_instance($user){return new self();} function verify($token){return $token==='valid-wp-session';}}
class WP_Error {function __construct(...$args){}}
class WP_REST_Response {public $data;function __construct($data,...$args){$this->data=$data;}}
class Request {function __construct(public $params){} function get_param($key){return $this->params[$key]??null;}}
class FakeDB {public $options='wp_options';function prepare($q,...$args){return $args;} function query($args){global $options;[$key,$value]=$args;if(isset($options[$key])&&serialize($options[$key])===$value){unset($options[$key]);return 1;}return 0;}}
$wpdb=new FakeDB();
require __DIR__.'/../../integrations/wordpress/presenton-site-login.php';
function check($yes,$message){if(!$yes){throw new Exception($message);}}
check(presenton_site_access(7,1),'site admin must access own site');
check(!presenton_site_access(7,2),'site admin must not access another site');
check(!presenton_site_access(10,1),'subscriber/nonmember denied');
check(presenton_site_access(9,1)&&presenton_site_access(9,2),'super admin may select either site');
check(!presenton_site_access(9,3),'invalid site denied even to super admin');
$actions['rest_api_init']();
$code=str_repeat('a',64);$verifier=str_repeat('b',43);$name=presenton_login_option_name('code',$code);
$options[$name]=['site'=>1,'user'=>7,'wp_session'=>'valid-wp-session','expires'=>time()+60,'challenge'=>rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'=')];
check($routes['/exchange'](new Request(['code'=>$code,'verifier'=>str_repeat('c',43)])) instanceof WP_Error,'PKCE mismatch denied');
$result=$routes['/exchange'](new Request(['code'=>$code,'verifier'=>$verifier]));check($result instanceof WP_REST_Response,'correct exchange succeeds');
check($routes['/exchange'](new Request(['code'=>$code,'verifier'=>$verifier])) instanceof WP_Error,'code replay denied');
$ticket=$result->data['ticket'];check($routes['/session'](new Request(['ticket'=>$ticket]))->data['parent_origin']==='https://site1.example','parent origin comes from verified site');check($routes['/session'](new Request(['ticket'=>$ticket])) instanceof WP_REST_Response,'session accepted');
unset($roles[7][1]);check($routes['/session'](new Request(['ticket'=>$ticket])) instanceof WP_Error,'removed membership revokes session');
echo "PASS: own-site admin, super-admin selection, nonmember denial, PKCE, replay protection, membership revocation\n";
