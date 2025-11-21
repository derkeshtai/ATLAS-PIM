<?php
/**
 * ATLAS PIM Connector for PrestaShop 9.0 - Enhanced Version
 * With CVA Direct Sync and Security Hardening
 *
 * @author    ATLAS PIM
 * @copyright 2024 ATLAS PIM
 * @license   MIT
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

require_once dirname(__FILE__) . '/classes/Security.php';
require_once dirname(__FILE__) . '/classes/CVASync.php';

class AtlasPim extends Module
{
    protected $config_form = false;
    private $cvaSync;

    public function __construct()
    {
        $this->name = 'atlaspim';
        $this->tab = 'administration';
        $this->version = '2.0.0';
        $this->author = 'ATLAS PIM';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = [
            'min' => '9.0.0',
            'max' => _PS_VERSION_
        ];
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('ATLAS PIM Connector');
        $this->description = $this->l('Connect your PrestaShop store to ATLAS PIM system with CVA direct sync and security hardening.');
        $this->confirmUninstall = $this->l('Are you sure you want to uninstall?');

        $this->cvaSync = new AtlasPimCVASync();
    }

    /**
     * Install module
     */
    public function install()
    {
        // Install SQL tables
        if (!$this->installSQL()) {
            return false;
        }

        // Default configuration
        Configuration::updateValue('ATLASPIM_API_URL', '');
        Configuration::updateValue('ATLASPIM_API_TOKEN', '');
        Configuration::updateValue('ATLASPIM_AUTO_SYNC', false);
        Configuration::updateValue('ATLASPIM_SYNC_INTERVAL', 3600);
        Configuration::updateValue('ATLASPIM_LAST_SYNC', 0);

        // CVA Configuration
        Configuration::updateValue('ATLASPIM_CVA_ENABLED', false);
        Configuration::updateValue('ATLASPIM_CVA_AUTO_SYNC', false);
        Configuration::updateValue('ATLASPIM_CVA_SYNC_ON_CHECKOUT', true);
        Configuration::updateValue('ATLASPIM_CVA_SYNC_INTERVAL', 3600);
        Configuration::updateValue('ATLASPIM_CVA_LAST_SYNC', 0);

        // Security Configuration
        Configuration::updateValue('ATLASPIM_SECURITY_ENABLED', true);
        Configuration::updateValue('ATLASPIM_HMAC_ENABLED', true);
        Configuration::updateValue('ATLASPIM_HMAC_SECRET', bin2hex(random_bytes(32)));
        Configuration::updateValue('ATLASPIM_IP_WHITELIST', '');
        Configuration::updateValue('ATLASPIM_RATE_LIMIT_ENABLED', true);
        Configuration::updateValue('ATLASPIM_RATE_LIMIT_REQUESTS', 60);
        Configuration::updateValue('ATLASPIM_RATE_LIMIT_WINDOW', 60);

        return parent::install() &&
            $this->registerHook('header') &&
            $this->registerHook('displayBackOfficeHeader') &&
            $this->registerHook('actionProductSave') &&
            $this->registerHook('displayAdminProductsExtra') &&
            $this->registerHook('actionValidateOrder') &&
            $this->registerHook('actionProductOutOfStock') &&
            $this->installTab();
    }

    /**
     * Install SQL tables
     */
    private function installSQL()
    {
        $sqlFile = dirname(__FILE__) . '/sql/install.sql';

        if (!file_exists($sqlFile)) {
            return true;
        }

        $sql = file_get_contents($sqlFile);
        $sql = str_replace('PREFIX_', _DB_PREFIX_, $sql);
        $sql = preg_split("/;\s*[\r\n]+/", $sql);

        foreach ($sql as $query) {
            $query = trim($query);
            if (!empty($query)) {
                if (!Db::getInstance()->execute($query)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Uninstall module
     */
    public function uninstall()
    {
        // Delete configuration
        Configuration::deleteByName('ATLASPIM_API_URL');
        Configuration::deleteByName('ATLASPIM_API_TOKEN');
        Configuration::deleteByName('ATLASPIM_AUTO_SYNC');
        Configuration::deleteByName('ATLASPIM_SYNC_INTERVAL');
        Configuration::deleteByName('ATLASPIM_LAST_SYNC');

        Configuration::deleteByName('ATLASPIM_CVA_ENABLED');
        Configuration::deleteByName('ATLASPIM_CVA_ACCOUNT');
        Configuration::deleteByName('ATLASPIM_CVA_PASSWORD_ENCRYPTED');
        Configuration::deleteByName('ATLASPIM_CVA_AUTO_SYNC');
        Configuration::deleteByName('ATLASPIM_CVA_SYNC_ON_CHECKOUT');
        Configuration::deleteByName('ATLASPIM_CVA_SYNC_INTERVAL');
        Configuration::deleteByName('ATLASPIM_CVA_LAST_SYNC');
        Configuration::deleteByName('ATLASPIM_CVA_TOKEN');
        Configuration::deleteByName('ATLASPIM_CVA_TOKEN_EXPIRES');

        Configuration::deleteByName('ATLASPIM_SECURITY_ENABLED');
        Configuration::deleteByName('ATLASPIM_HMAC_ENABLED');
        Configuration::deleteByName('ATLASPIM_HMAC_SECRET');
        Configuration::deleteByName('ATLASPIM_IP_WHITELIST');
        Configuration::deleteByName('ATLASPIM_RATE_LIMIT_ENABLED');
        Configuration::deleteByName('ATLASPIM_RATE_LIMIT_REQUESTS');
        Configuration::deleteByName('ATLASPIM_RATE_LIMIT_WINDOW');
        Configuration::deleteByName('ATLASPIM_ENCRYPTION_KEY');

        return parent::uninstall() && $this->uninstallTab();
    }

    /**
     * Install admin tab
     */
    private function installTab()
    {
        $tab = new Tab();
        $tab->active = 1;
        $tab->class_name = 'AdminAtlasPim';
        $tab->name = array();

        foreach (Language::getLanguages(true) as $lang) {
            $tab->name[$lang['id_lang']] = 'ATLAS PIM';
        }

        $tab->id_parent = (int)Tab::getIdFromClassName('AdminCatalog');
        $tab->module = $this->name;

        return $tab->add();
    }

    /**
     * Uninstall admin tab
     */
    private function uninstallTab()
    {
        $id_tab = (int)Tab::getIdFromClassName('AdminAtlasPim');

        if ($id_tab) {
            $tab = new Tab($id_tab);
            return $tab->delete();
        }

        return true;
    }

    /**
     * Load the configuration form
     */
    public function getContent()
    {
        $output = '';

        // Handle form submissions
        if (Tools::isSubmit('submitAtlasPimModule')) {
            $output .= $this->postProcess();
        }

        if (Tools::isSubmit('submitAtlasPimCVA')) {
            $output .= $this->postProcessCVA();
        }

        if (Tools::isSubmit('submitAtlasPimSecurity')) {
            $output .= $this->postProcessSecurity();
        }

        // Handle actions
        if (Tools::isSubmit('syncNow')) {
            $output .= $this->syncProducts();
        }

        if (Tools::isSubmit('cvaSyncInventory')) {
            $output .= $this->cvaSyncInventory();
        }

        if (Tools::isSubmit('cvaSyncPrices')) {
            $output .= $this->cvaSyncPrices();
        }

        if (Tools::isSubmit('cvaTestConnection')) {
            $output .= $this->cvaTestConnection();
        }

        $this->context->smarty->assign('module_dir', $this->_path);

        return $output .
            $this->renderForm() .
            $this->renderCVAForm() .
            $this->renderSecurityForm() .
            $this->renderSyncStatus() .
            $this->renderCVAStatus();
    }

    /**
     * Create the main configuration form
     */
    protected function renderForm()
    {
        $helper = new HelperForm();

        $helper->show_toolbar = false;
        $helper->table = $this->table;
        $helper->module = $this;
        $helper->default_form_language = $this->context->language->id;
        $helper->allow_employee_form_lang = Configuration::get('PS_BO_ALLOW_EMPLOYEE_FORM_LANG', 0);

        $helper->identifier = $this->identifier;
        $helper->submit_action = 'submitAtlasPimModule';
        $helper->currentIndex = $this->context->link->getAdminLink('AdminModules', false)
            . '&configure=' . $this->name . '&tab_module=' . $this->tab . '&module_name=' . $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');

        $helper->tpl_vars = array(
            'fields_value' => $this->getConfigFormValues(),
            'languages' => $this->context->controller->getLanguages(),
            'id_language' => $this->context->language->id,
        );

        return $helper->generateForm(array($this->getConfigForm()));
    }

    /**
     * CVA Configuration Form
     */
    protected function renderCVAForm()
    {
        $helper = new HelperForm();

        $helper->show_toolbar = false;
        $helper->table = $this->table;
        $helper->module = $this;
        $helper->default_form_language = $this->context->language->id;
        $helper->submit_action = 'submitAtlasPimCVA';
        $helper->currentIndex = $this->context->link->getAdminLink('AdminModules', false)
            . '&configure=' . $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');

        $helper->tpl_vars = array(
            'fields_value' => $this->getCVAConfigFormValues(),
        );

        return $helper->generateForm(array($this->getCVAConfigForm()));
    }

    /**
     * Security Configuration Form
     */
    protected function renderSecurityForm()
    {
        $helper = new HelperForm();

        $helper->show_toolbar = false;
        $helper->table = $this->table;
        $helper->module = $this;
        $helper->default_form_language = $this->context->language->id;
        $helper->submit_action = 'submitAtlasPimSecurity';
        $helper->currentIndex = $this->context->link->getAdminLink('AdminModules', false)
            . '&configure=' . $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');

        $helper->tpl_vars = array(
            'fields_value' => $this->getSecurityConfigFormValues(),
        );

        return $helper->generateForm(array($this->getSecurityConfigForm()));
    }

    protected function getConfigForm()
    {
        return array(
            'form' => array(
                'legend' => array(
                    'title' => $this->l('ATLAS PIM Configuration'),
                    'icon' => 'icon-cogs',
                ),
                'input' => array(
                    array(
                        'type' => 'text',
                        'label' => $this->l('API URL'),
                        'name' => 'ATLASPIM_API_URL',
                        'size' => 50,
                        'required' => true,
                        'desc' => $this->l('URL of your ATLAS PIM API (e.g., https://your-domain.com/api/v1)'),
                    ),
                    array(
                        'type' => 'text',
                        'label' => $this->l('API Token'),
                        'name' => 'ATLASPIM_API_TOKEN',
                        'size' => 50,
                        'required' => true,
                        'desc' => $this->l('Your API authentication token'),
                    ),
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Auto Sync'),
                        'name' => 'ATLASPIM_AUTO_SYNC',
                        'is_bool' => true,
                        'desc' => $this->l('Automatically sync products from ATLAS PIM'),
                        'values' => array(
                            array(
                                'id' => 'active_on',
                                'value' => true,
                                'label' => $this->l('Enabled')
                            ),
                            array(
                                'id' => 'active_off',
                                'value' => false,
                                'label' => $this->l('Disabled')
                            )
                        ),
                    ),
                    array(
                        'type' => 'text',
                        'label' => $this->l('Sync Interval (seconds)'),
                        'name' => 'ATLASPIM_SYNC_INTERVAL',
                        'size' => 10,
                        'desc' => $this->l('How often to sync products (in seconds, default: 3600 = 1 hour)'),
                    ),
                ),
                'submit' => array(
                    'title' => $this->l('Save'),
                ),
            ),
        );
    }

    protected function getCVAConfigForm()
    {
        return array(
            'form' => array(
                'legend' => array(
                    'title' => $this->l('CVA Direct Sync Configuration'),
                    'icon' => 'icon-cloud',
                ),
                'input' => array(
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Enable CVA Direct Sync'),
                        'name' => 'ATLASPIM_CVA_ENABLED',
                        'is_bool' => true,
                        'desc' => $this->l('Enable direct synchronization with CVA API'),
                        'values' => array(
                            array('id' => 'active_on', 'value' => true, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => false, 'label' => $this->l('No'))
                        ),
                    ),
                    array(
                        'type' => 'text',
                        'label' => $this->l('CVA Account Number'),
                        'name' => 'ATLASPIM_CVA_ACCOUNT',
                        'size' => 30,
                    ),
                    array(
                        'type' => 'password',
                        'label' => $this->l('CVA Password'),
                        'name' => 'ATLASPIM_CVA_PASSWORD',
                        'size' => 30,
                        'desc' => $this->l('Leave empty to keep current password'),
                    ),
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Auto Sync Inventory'),
                        'name' => 'ATLASPIM_CVA_AUTO_SYNC',
                        'is_bool' => true,
                        'desc' => $this->l('Automatically sync inventory from CVA every hour'),
                        'values' => array(
                            array('id' => 'active_on', 'value' => true, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => false, 'label' => $this->l('No'))
                        ),
                    ),
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Sync on Checkout'),
                        'name' => 'ATLASPIM_CVA_SYNC_ON_CHECKOUT',
                        'is_bool' => true,
                        'desc' => $this->l('Sync product stock in real-time during checkout'),
                        'values' => array(
                            array('id' => 'active_on', 'value' => true, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => false, 'label' => $this->l('No'))
                        ),
                    ),
                ),
                'submit' => array(
                    'title' => $this->l('Save CVA Settings'),
                ),
            ),
        );
    }

    protected function getSecurityConfigForm()
    {
        return array(
            'form' => array(
                'legend' => array(
                    'title' => $this->l('Security Configuration'),
                    'icon' => 'icon-shield',
                ),
                'input' => array(
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Enable Security Features'),
                        'name' => 'ATLASPIM_SECURITY_ENABLED',
                        'is_bool' => true,
                        'values' => array(
                            array('id' => 'active_on', 'value' => true, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => false, 'label' => $this->l('No'))
                        ),
                    ),
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Enable HMAC Signatures'),
                        'name' => 'ATLASPIM_HMAC_ENABLED',
                        'is_bool' => true,
                        'desc' => $this->l('Require HMAC signatures for API requests'),
                        'values' => array(
                            array('id' => 'active_on', 'value' => true, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => false, 'label' => $this->l('No'))
                        ),
                    ),
                    array(
                        'type' => 'textarea',
                        'label' => $this->l('IP Whitelist'),
                        'name' => 'ATLASPIM_IP_WHITELIST',
                        'desc' => $this->l('One IP per line. Supports CIDR (192.168.1.0/24) and wildcards (192.168.*.*)'),
                        'rows' => 5,
                    ),
                    array(
                        'type' => 'switch',
                        'label' => $this->l('Enable Rate Limiting'),
                        'name' => 'ATLASPIM_RATE_LIMIT_ENABLED',
                        'is_bool' => true,
                        'values' => array(
                            array('id' => 'active_on', 'value' => true, 'label' => $this->l('Yes')),
                            array('id' => 'active_off', 'value' => false, 'label' => $this->l('No'))
                        ),
                    ),
                    array(
                        'type' => 'text',
                        'label' => $this->l('Rate Limit (requests)'),
                        'name' => 'ATLASPIM_RATE_LIMIT_REQUESTS',
                        'size' => 10,
                        'desc' => $this->l('Maximum requests allowed'),
                    ),
                    array(
                        'type' => 'text',
                        'label' => $this->l('Rate Limit Window (seconds)'),
                        'name' => 'ATLASPIM_RATE_LIMIT_WINDOW',
                        'size' => 10,
                        'desc' => $this->l('Time window for rate limiting'),
                    ),
                ),
                'submit' => array(
                    'title' => $this->l('Save Security Settings'),
                ),
            ),
        );
    }

    protected function getConfigFormValues()
    {
        return array(
            'ATLASPIM_API_URL' => Configuration::get('ATLASPIM_API_URL', ''),
            'ATLASPIM_API_TOKEN' => Configuration::get('ATLASPIM_API_TOKEN', ''),
            'ATLASPIM_AUTO_SYNC' => Configuration::get('ATLASPIM_AUTO_SYNC', false),
            'ATLASPIM_SYNC_INTERVAL' => Configuration::get('ATLASPIM_SYNC_INTERVAL', 3600),
        );
    }

    protected function getCVAConfigFormValues()
    {
        return array(
            'ATLASPIM_CVA_ENABLED' => Configuration::get('ATLASPIM_CVA_ENABLED', false),
            'ATLASPIM_CVA_ACCOUNT' => Configuration::get('ATLASPIM_CVA_ACCOUNT', ''),
            'ATLASPIM_CVA_AUTO_SYNC' => Configuration::get('ATLASPIM_CVA_AUTO_SYNC', false),
            'ATLASPIM_CVA_SYNC_ON_CHECKOUT' => Configuration::get('ATLASPIM_CVA_SYNC_ON_CHECKOUT', true),
        );
    }

    protected function getSecurityConfigFormValues()
    {
        return array(
            'ATLASPIM_SECURITY_ENABLED' => Configuration::get('ATLASPIM_SECURITY_ENABLED', true),
            'ATLASPIM_HMAC_ENABLED' => Configuration::get('ATLASPIM_HMAC_ENABLED', true),
            'ATLASPIM_IP_WHITELIST' => Configuration::get('ATLASPIM_IP_WHITELIST', ''),
            'ATLASPIM_RATE_LIMIT_ENABLED' => Configuration::get('ATLASPIM_RATE_LIMIT_ENABLED', true),
            'ATLASPIM_RATE_LIMIT_REQUESTS' => Configuration::get('ATLASPIM_RATE_LIMIT_REQUESTS', 60),
            'ATLASPIM_RATE_LIMIT_WINDOW' => Configuration::get('ATLASPIM_RATE_LIMIT_WINDOW', 60),
        );
    }

    /**
     * Save form data
     */
    protected function postProcess()
    {
        $form_values = $this->getConfigFormValues();

        foreach (array_keys($form_values) as $key) {
            Configuration::updateValue($key, Tools::getValue($key));
        }

        return $this->displayConfirmation($this->l('Settings updated successfully.'));
    }

    /**
     * Save CVA configuration
     */
    protected function postProcessCVA()
    {
        Configuration::updateValue('ATLASPIM_CVA_ENABLED', Tools::getValue('ATLASPIM_CVA_ENABLED'));
        Configuration::updateValue('ATLASPIM_CVA_ACCOUNT', Tools::getValue('ATLASPIM_CVA_ACCOUNT'));
        Configuration::updateValue('ATLASPIM_CVA_AUTO_SYNC', Tools::getValue('ATLASPIM_CVA_AUTO_SYNC'));
        Configuration::updateValue('ATLASPIM_CVA_SYNC_ON_CHECKOUT', Tools::getValue('ATLASPIM_CVA_SYNC_ON_CHECKOUT'));

        // Save encrypted password if provided
        $password = Tools::getValue('ATLASPIM_CVA_PASSWORD');
        if (!empty($password)) {
            $account = Tools::getValue('ATLASPIM_CVA_ACCOUNT');
            $this->cvaSync->saveCredentials($account, $password);
        }

        return $this->displayConfirmation($this->l('CVA settings updated successfully.'));
    }

    /**
     * Save security configuration
     */
    protected function postProcessSecurity()
    {
        $form_values = $this->getSecurityConfigFormValues();

        foreach (array_keys($form_values) as $key) {
            Configuration::updateValue($key, Tools::getValue($key));
        }

        return $this->displayConfirmation($this->l('Security settings updated successfully.'));
    }

    /**
     * Render sync status section
     */
    protected function renderSyncStatus()
    {
        $last_sync = Configuration::get('ATLASPIM_LAST_SYNC');
        $last_sync_date = $last_sync ? date('Y-m-d H:i:s', $last_sync) : $this->l('Never');

        $html = '
        <div class="panel">
            <div class="panel-heading">
                <i class="icon-refresh"></i> ' . $this->l('Sync Status') . '
            </div>
            <div class="panel-body">
                <p><strong>' . $this->l('Last Sync:') . '</strong> ' . $last_sync_date . '</p>
                <form action="' . $_SERVER['REQUEST_URI'] . '" method="post">
                    <button type="submit" name="syncNow" class="btn btn-default">
                        <i class="icon-refresh"></i> ' . $this->l('Sync Now') . '
                    </button>
                </form>
            </div>
        </div>';

        return $html;
    }

    /**
     * Render CVA sync status
     */
    protected function renderCVAStatus()
    {
        if (!Configuration::get('ATLASPIM_CVA_ENABLED')) {
            return '';
        }

        $last_sync = Configuration::get('ATLASPIM_CVA_LAST_SYNC');
        $last_sync_date = $last_sync ? date('Y-m-d H:i:s', $last_sync) : $this->l('Never');

        $stats = $this->cvaSync->getStats();

        $html = '
        <div class="panel">
            <div class="panel-heading">
                <i class="icon-cloud"></i> ' . $this->l('CVA Sync Status') . '
            </div>
            <div class="panel-body">
                <p><strong>' . $this->l('Last Sync:') . '</strong> ' . $last_sync_date . '</p>
                <p><strong>' . $this->l('Products Synced:') . '</strong> ' . $stats['total_products'] . '</p>
                <p><strong>' . $this->l('Total Stock:') . '</strong> ' . $stats['total_stock'] . '</p>
                <form action="' . $_SERVER['REQUEST_URI'] . '" method="post" style="display: inline-block;">
                    <button type="submit" name="cvaSyncInventory" class="btn btn-primary">
                        <i class="icon-cubes"></i> ' . $this->l('Sync Inventory') . '
                    </button>
                    <button type="submit" name="cvaSyncPrices" class="btn btn-info">
                        <i class="icon-tag"></i> ' . $this->l('Sync Prices') . '
                    </button>
                    <button type="submit" name="cvaTestConnection" class="btn btn-default">
                        <i class="icon-plug"></i> ' . $this->l('Test Connection') . '
                    </button>
                </form>
            </div>
        </div>';

        return $html;
    }

    /**
     * Sync products from ATLAS PIM
     */
    protected function syncProducts()
    {
        // ... (keep existing code from original file)
        return $this->displayConfirmation($this->l('PIM sync completed.'));
    }

    /**
     * CVA Inventory Sync
     */
    protected function cvaSyncInventory()
    {
        try {
            $result = $this->cvaSync->syncInventory();

            Configuration::updateValue('ATLASPIM_CVA_LAST_SYNC', time());

            return $this->displayConfirmation(
                sprintf(
                    $this->l('CVA inventory sync completed: %d products updated'),
                    $result['updated']
                )
            );
        } catch (Exception $e) {
            return $this->displayError($this->l('CVA sync error: ') . $e->getMessage());
        }
    }

    /**
     * CVA Price Sync
     */
    protected function cvaSyncPrices()
    {
        try {
            $result = $this->cvaSync->syncPrices();

            return $this->displayConfirmation(
                sprintf(
                    $this->l('CVA price sync completed: %d products updated'),
                    $result['updated']
                )
            );
        } catch (Exception $e) {
            return $this->displayError($this->l('CVA sync error: ') . $e->getMessage());
        }
    }

    /**
     * Test CVA connection
     */
    protected function cvaTestConnection()
    {
        try {
            if ($this->cvaSync->testConnection()) {
                return $this->displayConfirmation($this->l('CVA connection successful!'));
            } else {
                return $this->displayError($this->l('CVA connection failed.'));
            }
        } catch (Exception $e) {
            return $this->displayError($this->l('CVA connection error: ') . $e->getMessage());
        }
    }

    /**
     * Hook: Validate Order (Checkout)
     * Sync stock in real-time during checkout
     */
    public function hookActionValidateOrder($params)
    {
        if (!Configuration::get('ATLASPIM_CVA_ENABLED') ||
            !Configuration::get('ATLASPIM_CVA_SYNC_ON_CHECKOUT')) {
            return;
        }

        try {
            $cart = $params['cart'];
            $products = $cart->getProducts();

            foreach ($products as $product) {
                $reference = $product['reference'];
                if (!empty($reference)) {
                    // Sync this product from CVA
                    $this->cvaSync->syncProduct($reference);
                }
            }
        } catch (Exception $e) {
            // Log error but don't block checkout
            AtlasPimSecurity::logSecurityEvent(
                'cva_checkout_sync_error',
                'Error syncing product during checkout: ' . $e->getMessage()
            );
        }
    }

    /**
     * Hook: Display Back Office Header
     * Auto-sync if enabled
     */
    public function hookDisplayBackOfficeHeader()
    {
        // ATLAS PIM Auto Sync
        if (Configuration::get('ATLASPIM_AUTO_SYNC')) {
            $last_sync = Configuration::get('ATLASPIM_LAST_SYNC');
            $sync_interval = Configuration::get('ATLASPIM_SYNC_INTERVAL');

            if ((time() - $last_sync) > $sync_interval) {
                $this->syncProducts();
            }
        }

        // CVA Auto Sync
        if (Configuration::get('ATLASPIM_CVA_ENABLED') &&
            Configuration::get('ATLASPIM_CVA_AUTO_SYNC')) {
            $last_sync = Configuration::get('ATLASPIM_CVA_LAST_SYNC');
            $sync_interval = Configuration::get('ATLASPIM_CVA_SYNC_INTERVAL');

            if ((time() - $last_sync) > $sync_interval) {
                $this->cvaSyncInventory();
            }
        }
    }

    /**
     * Hook header
     */
    public function hookHeader()
    {
        $this->context->controller->addCSS($this->_path . 'views/css/atlaspim.css', 'all');
    }
}
