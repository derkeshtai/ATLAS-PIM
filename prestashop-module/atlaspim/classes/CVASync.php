<?php
/**
 * CVA API Direct Synchronization for PrestaShop
 *
 * @author    ATLAS PIM
 * @copyright 2024 ATLAS PIM
 * @license   MIT
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

require_once dirname(__FILE__) . '/Security.php';

class AtlasPimCVASync
{
    const CVA_API_URL = 'https://apicvaservices.grupocva.com';
    const TOKEN_VALIDITY = 43200; // 12 hours in seconds

    private $accountNumber;
    private $password;
    private $apiToken;
    private $tokenExpiresAt;

    /**
     * Constructor
     */
    public function __construct()
    {
        $this->accountNumber = Configuration::get('ATLASPIM_CVA_ACCOUNT');
        $this->password = $this->getDecryptedPassword();
        $this->loadToken();
    }

    /**
     * Get decrypted CVA password
     */
    private function getDecryptedPassword()
    {
        $encrypted = Configuration::get('ATLASPIM_CVA_PASSWORD_ENCRYPTED');
        $key = $this->getEncryptionKey();

        if (empty($encrypted) || empty($key)) {
            return null;
        }

        return AtlasPimSecurity::decrypt($encrypted, $key);
    }

    /**
     * Get encryption key for passwords
     */
    private function getEncryptionKey()
    {
        $key = Configuration::get('ATLASPIM_ENCRYPTION_KEY');

        if (empty($key)) {
            // Generate new key if not exists
            $key = bin2hex(random_bytes(32));
            Configuration::updateValue('ATLASPIM_ENCRYPTION_KEY', $key);
        }

        return $key;
    }

    /**
     * Save encrypted CVA password
     */
    public function saveCredentials($accountNumber, $password)
    {
        $key = $this->getEncryptionKey();
        $encrypted = AtlasPimSecurity::encrypt($password, $key);

        Configuration::updateValue('ATLASPIM_CVA_ACCOUNT', $accountNumber);
        Configuration::updateValue('ATLASPIM_CVA_PASSWORD_ENCRYPTED', $encrypted);

        $this->accountNumber = $accountNumber;
        $this->password = $password;

        // Clear existing token
        Configuration::deleteByName('ATLASPIM_CVA_TOKEN');
        Configuration::deleteByName('ATLASPIM_CVA_TOKEN_EXPIRES');
    }

    /**
     * Load existing token from configuration
     */
    private function loadToken()
    {
        $this->apiToken = Configuration::get('ATLASPIM_CVA_TOKEN');
        $this->tokenExpiresAt = Configuration::get('ATLASPIM_CVA_TOKEN_EXPIRES');
    }

    /**
     * Save token to configuration
     */
    private function saveToken($token, $expiresAt)
    {
        $this->apiToken = $token;
        $this->tokenExpiresAt = $expiresAt;

        Configuration::updateValue('ATLASPIM_CVA_TOKEN', $token);
        Configuration::updateValue('ATLASPIM_CVA_TOKEN_EXPIRES', $expiresAt);
    }

    /**
     * Check if token is valid
     */
    private function isTokenValid()
    {
        if (empty($this->apiToken) || empty($this->tokenExpiresAt)) {
            return false;
        }

        // Refresh if less than 1 hour remaining
        return time() < ($this->tokenExpiresAt - 3600);
    }

    /**
     * Authenticate with CVA API
     */
    private function authenticate()
    {
        if (empty($this->accountNumber) || empty($this->password)) {
            throw new Exception('CVA credentials not configured');
        }

        $url = self::CVA_API_URL . '/api/v2/user/login';

        $response = $this->makeRequest($url, 'POST', [
            'cuenta' => $this->accountNumber,
            'contrasena' => $this->password,
        ], false); // No auth header for login

        if (empty($response['token'])) {
            throw new Exception('Failed to obtain CVA token');
        }

        $expiresAt = time() + self::TOKEN_VALIDITY;
        $this->saveToken($response['token'], $expiresAt);

        return $response['token'];
    }

    /**
     * Get valid token (authenticate if needed)
     */
    private function getToken()
    {
        if (!$this->isTokenValid()) {
            return $this->authenticate();
        }

        return $this->apiToken;
    }

    /**
     * Make HTTP request to CVA API
     */
    private function makeRequest($url, $method = 'GET', $data = null, $auth = true)
    {
        $ch = curl_init();

        $headers = ['Content-Type: application/json'];

        if ($auth) {
            $token = $this->getToken();
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        if ($method === 'POST' && $data) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);

        curl_close($ch);

        if ($error) {
            throw new Exception('CVA API request failed: ' . $error);
        }

        if ($httpCode >= 400) {
            throw new Exception('CVA API error: HTTP ' . $httpCode);
        }

        return json_decode($response, true);
    }

    /**
     * Sync inventory (stock) from CVA
     */
    public function syncInventory()
    {
        $url = self::CVA_API_URL . '/api/v2/catalogo_clientes/lista_precios';

        $params = [
            'exist' => 3, // Both branch and CEDIS
            'page' => 1,
        ];

        $updated = 0;
        $errors = [];

        do {
            $response = $this->makeRequest(
                $url . '?' . http_build_query($params)
            );

            if (empty($response['data'])) {
                break;
            }

            foreach ($response['data'] as $item) {
                try {
                    $this->updateProductStock($item);
                    $updated++;
                } catch (Exception $e) {
                    $errors[] = [
                        'clave' => $item['clave'] ?? 'unknown',
                        'error' => $e->getMessage(),
                    ];
                }
            }

            $params['page']++;
        } while (!empty($response['data']));

        return [
            'updated' => $updated,
            'errors' => $errors,
        ];
    }

    /**
     * Update product stock from CVA data
     */
    private function updateProductStock($cvaProduct)
    {
        // Find product by CVA clave (stored in reference or custom field)
        $productId = $this->findProductByClave($cvaProduct['clave']);

        if (!$productId) {
            return; // Product not found, skip
        }

        $stockBranch = (int)($cvaProduct['disponible'] ?? 0);
        $stockCedis = (int)($cvaProduct['disponibleCD'] ?? 0);
        $totalStock = $stockBranch + $stockCedis;

        // Update stock
        StockAvailable::setQuantity($productId, 0, $totalStock);

        // Store in custom table for detailed tracking
        $this->saveCVAStockDetails($productId, $cvaProduct);
    }

    /**
     * Find product by CVA clave
     */
    private function findProductByClave($clave)
    {
        $sql = "SELECT p.id_product
                FROM " . _DB_PREFIX_ . "product p
                WHERE p.reference = '" . pSQL($clave) . "'
                LIMIT 1";

        return Db::getInstance()->getValue($sql);
    }

    /**
     * Save detailed CVA stock information
     */
    private function saveCVAStockDetails($productId, $cvaProduct)
    {
        $table = _DB_PREFIX_ . 'atlaspim_cva_stock';

        $data = [
            'id_product' => (int)$productId,
            'clave' => pSQL($cvaProduct['clave']),
            'stock_branch' => (int)($cvaProduct['disponible'] ?? 0),
            'stock_cedis' => (int)($cvaProduct['disponibleCD'] ?? 0),
            'last_price' => (float)($cvaProduct['precio'] ?? 0),
            'currency' => pSQL($cvaProduct['moneda'] ?? 'MXN'),
            'has_promotion' => (bool)($cvaProduct['promocion'] ?? false),
            'updated_at' => date('Y-m-d H:i:s'),
        ];

        // Check if record exists
        $exists = Db::getInstance()->getValue("
            SELECT id_product FROM `{$table}`
            WHERE id_product = " . (int)$productId
        );

        if ($exists) {
            Db::getInstance()->update('atlaspim_cva_stock', $data, 'id_product = ' . (int)$productId);
        } else {
            Db::getInstance()->insert('atlaspim_cva_stock', $data);
        }
    }

    /**
     * Sync prices from CVA
     */
    public function syncPrices()
    {
        $url = self::CVA_API_URL . '/api/v2/catalogo_clientes/lista_precios';

        $params = [
            'exist' => 0, // All products
            'page' => 1,
        ];

        $updated = 0;
        $errors = [];

        do {
            $response = $this->makeRequest(
                $url . '?' . http_build_query($params)
            );

            if (empty($response['data'])) {
                break;
            }

            foreach ($response['data'] as $item) {
                try {
                    $this->updateProductPrice($item);
                    $updated++;
                } catch (Exception $e) {
                    $errors[] = [
                        'clave' => $item['clave'] ?? 'unknown',
                        'error' => $e->getMessage(),
                    ];
                }
            }

            $params['page']++;
        } while (!empty($response['data']));

        return [
            'updated' => $updated,
            'errors' => $errors,
        ];
    }

    /**
     * Update product price from CVA data
     */
    private function updateProductPrice($cvaProduct)
    {
        $productId = $this->findProductByClave($cvaProduct['clave']);

        if (!$productId) {
            return;
        }

        $price = (float)($cvaProduct['precio'] ?? 0);

        if ($price > 0) {
            $product = new Product($productId);
            $product->price = $price;
            $product->save();
        }
    }

    /**
     * Sync single product by clave (for checkout)
     */
    public function syncProduct($clave)
    {
        $url = self::CVA_API_URL . '/api/v2/catalogo_clientes/lista_precios';

        $params = [
            'clave' => $clave,
        ];

        $response = $this->makeRequest(
            $url . '?' . http_build_query($params)
        );

        if (empty($response['data']) || !is_array($response['data'])) {
            throw new Exception('Product not found in CVA');
        }

        $cvaProduct = reset($response['data']);

        $this->updateProductStock($cvaProduct);
        $this->updateProductPrice($cvaProduct);

        return [
            'stock_branch' => (int)($cvaProduct['disponible'] ?? 0),
            'stock_cedis' => (int)($cvaProduct['disponibleCD'] ?? 0),
            'price' => (float)($cvaProduct['precio'] ?? 0),
        ];
    }

    /**
     * Test connection to CVA API
     */
    public function testConnection()
    {
        try {
            $token = $this->getToken();
            return !empty($token);
        } catch (Exception $e) {
            return false;
        }
    }

    /**
     * Get sync statistics
     */
    public function getStats()
    {
        $table = _DB_PREFIX_ . 'atlaspim_cva_stock';

        $totalProducts = Db::getInstance()->getValue("
            SELECT COUNT(*) FROM `{$table}`
        ");

        $lastUpdate = Db::getInstance()->getValue("
            SELECT MAX(updated_at) FROM `{$table}`
        ");

        $totalStock = Db::getInstance()->getValue("
            SELECT SUM(stock_branch + stock_cedis) FROM `{$table}`
        ");

        return [
            'total_products' => (int)$totalProducts,
            'last_update' => $lastUpdate,
            'total_stock' => (int)$totalStock,
        ];
    }
}
