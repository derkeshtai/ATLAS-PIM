<?php
/**
 * ATLAS PIM Connector for PrestaShop 9.0
 *
 * @author    ATLAS PIM
 * @copyright 2024 ATLAS PIM
 * @license   MIT
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class AtlasPim extends Module
{
    protected $config_form = false;

    public function __construct()
    {
        $this->name = 'atlaspim';
        $this->tab = 'administration';
        $this->version = '1.0.0';
        $this->author = 'ATLAS PIM';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = [
            'min' => '9.0.0',
            'max' => _PS_VERSION_
        ];
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('ATLAS PIM Connector');
        $this->description = $this->l('Connect your PrestaShop store to ATLAS PIM system for enriched product information.');
        $this->confirmUninstall = $this->l('Are you sure you want to uninstall?');
    }

    /**
     * Install module
     */
    public function install()
    {
        Configuration::updateValue('ATLASPIM_API_URL', '');
        Configuration::updateValue('ATLASPIM_API_TOKEN', '');
        Configuration::updateValue('ATLASPIM_AUTO_SYNC', false);
        Configuration::updateValue('ATLASPIM_SYNC_INTERVAL', 3600);
        Configuration::updateValue('ATLASPIM_LAST_SYNC', 0);

        return parent::install() &&
            $this->registerHook('header') &&
            $this->registerHook('displayBackOfficeHeader') &&
            $this->registerHook('actionProductSave') &&
            $this->registerHook('displayAdminProductsExtra') &&
            $this->installTab();
    }

    /**
     * Uninstall module
     */
    public function uninstall()
    {
        Configuration::deleteByName('ATLASPIM_API_URL');
        Configuration::deleteByName('ATLASPIM_API_TOKEN');
        Configuration::deleteByName('ATLASPIM_AUTO_SYNC');
        Configuration::deleteByName('ATLASPIM_SYNC_INTERVAL');
        Configuration::deleteByName('ATLASPIM_LAST_SYNC');

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

        if (Tools::isSubmit('submitAtlasPimModule')) {
            $output .= $this->postProcess();
        }

        if (Tools::isSubmit('syncNow')) {
            $output .= $this->syncProducts();
        }

        $this->context->smarty->assign('module_dir', $this->_path);

        return $output . $this->renderForm() . $this->renderSyncStatus();
    }

    /**
     * Create the form that will be displayed in the configuration page
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
     * Create the structure of configuration form
     */
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
     * Get current configuration values
     */
    protected function getConfigFormValues()
    {
        return array(
            'ATLASPIM_API_URL' => Configuration::get('ATLASPIM_API_URL', ''),
            'ATLASPIM_API_TOKEN' => Configuration::get('ATLASPIM_API_TOKEN', ''),
            'ATLASPIM_AUTO_SYNC' => Configuration::get('ATLASPIM_AUTO_SYNC', false),
            'ATLASPIM_SYNC_INTERVAL' => Configuration::get('ATLASPIM_SYNC_INTERVAL', 3600),
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
     * Sync products from ATLAS PIM
     */
    protected function syncProducts()
    {
        $api_url = Configuration::get('ATLASPIM_API_URL');
        $api_token = Configuration::get('ATLASPIM_API_TOKEN');

        if (empty($api_url) || empty($api_token)) {
            return $this->displayError($this->l('Please configure API URL and Token first.'));
        }

        try {
            // Fetch products from ATLAS PIM API
            $products = $this->fetchProductsFromAPI($api_url, $api_token);

            if (!$products) {
                return $this->displayError($this->l('Failed to fetch products from ATLAS PIM.'));
            }

            $imported = 0;
            $updated = 0;

            foreach ($products as $product_data) {
                if ($this->importProduct($product_data)) {
                    if ($this->productExists($product_data['reference'])) {
                        $updated++;
                    } else {
                        $imported++;
                    }
                }
            }

            Configuration::updateValue('ATLASPIM_LAST_SYNC', time());

            return $this->displayConfirmation(
                sprintf(
                    $this->l('Sync completed: %d products imported, %d updated.'),
                    $imported,
                    $updated
                )
            );
        } catch (Exception $e) {
            return $this->displayError($this->l('Sync error: ') . $e->getMessage());
        }
    }

    /**
     * Fetch products from ATLAS PIM API
     */
    protected function fetchProductsFromAPI($api_url, $api_token)
    {
        $url = rtrim($api_url, '/') . '/export/prestashop/json';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Authorization: Bearer ' . $api_token,
            'Content-Type: application/json'
        ));

        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($http_code !== 200) {
            return false;
        }

        $data = json_decode($response, true);

        return isset($data['data']) ? $data['data'] : false;
    }

    /**
     * Check if product exists by reference
     */
    protected function productExists($reference)
    {
        $id_product = (int)Db::getInstance()->getValue('
            SELECT id_product
            FROM ' . _DB_PREFIX_ . 'product
            WHERE reference = "' . pSQL($reference) . '"
        ');

        return $id_product > 0;
    }

    /**
     * Import or update product
     */
    protected function importProduct($product_data)
    {
        try {
            // Check if product exists
            $id_product = (int)Db::getInstance()->getValue('
                SELECT id_product
                FROM ' . _DB_PREFIX_ . 'product
                WHERE reference = "' . pSQL($product_data['reference']) . '"
            ');

            if ($id_product) {
                // Update existing product
                $product = new Product($id_product);
            } else {
                // Create new product
                $product = new Product();
            }

            // Set product data
            $product->reference = $product_data['reference'];
            $product->name = array((int)Configuration::get('PS_LANG_DEFAULT') => $product_data['name']);
            $product->description_short = array((int)Configuration::get('PS_LANG_DEFAULT') => $product_data['description_short']);
            $product->description = array((int)Configuration::get('PS_LANG_DEFAULT') => $product_data['description']);
            $product->price = (float)$product_data['price'];
            $product->wholesale_price = (float)$product_data['wholesale_price'];
            $product->on_sale = (int)$product_data['on_sale'];
            $product->active = (int)$product_data['active'];
            $product->meta_title = array((int)Configuration::get('PS_LANG_DEFAULT') => $product_data['meta_title']);
            $product->meta_description = array((int)Configuration::get('PS_LANG_DEFAULT') => $product_data['meta_description']);
            $product->meta_keywords = array((int)Configuration::get('PS_LANG_DEFAULT') => $product_data['meta_keywords']);
            $product->weight = (float)$product_data['weight'];
            $product->width = (float)$product_data['width'];
            $product->height = (float)$product_data['height'];
            $product->depth = (float)$product_data['depth'];

            if ($product->save()) {
                // Update stock
                StockAvailable::setQuantity($product->id, 0, (int)$product_data['quantity']);

                // Import images
                if (!empty($product_data['images'])) {
                    $this->importProductImages($product->id, $product_data['images']);
                }

                return true;
            }

            return false;
        } catch (Exception $e) {
            error_log('ATLAS PIM Import Error: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Import product images
     */
    protected function importProductImages($id_product, $images)
    {
        foreach ($images as $image_url) {
            try {
                $image = new Image();
                $image->id_product = $id_product;
                $image->position = Image::getHighestPosition($id_product) + 1;
                $image->cover = false;

                if ($image->add()) {
                    $image->associateTo(Shop::getShops());

                    // Download and save image
                    $path = _PS_PROD_IMG_DIR_ . $image->getImgFolder();

                    if (!file_exists($path)) {
                        @mkdir($path, 0777, true);
                    }

                    $ch = curl_init($image_url);
                    $fp = fopen($path . $image->id . '.jpg', 'wb');
                    curl_setopt($ch, CURLOPT_FILE, $fp);
                    curl_setopt($ch, CURLOPT_HEADER, 0);
                    curl_exec($ch);
                    curl_close($ch);
                    fclose($fp);

                    // Generate thumbnails
                    $image->createImgFolder();
                }
            } catch (Exception $e) {
                error_log('ATLAS PIM Image Import Error: ' . $e->getMessage());
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

    /**
     * Hook display back office header
     */
    public function hookDisplayBackOfficeHeader()
    {
        if (Configuration::get('ATLASPIM_AUTO_SYNC')) {
            $last_sync = Configuration::get('ATLASPIM_LAST_SYNC');
            $sync_interval = Configuration::get('ATLASPIM_SYNC_INTERVAL');

            if ((time() - $last_sync) > $sync_interval) {
                $this->syncProducts();
            }
        }
    }
}
