import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import {
  controlPlaneRoot,
  ensureDir,
  loadStages,
  nowIso,
  projectRelative,
  projectRoot,
  readStageSurface,
  summarizeControlPlane,
  writeJson,
  writeStageEvent,
  writeStageSurface
} from './cross-border-stage-control-lib.mjs'

const DEFAULT_SOURCE = 'http://www.qx-telecom.com/'
const DEFAULT_REFERENCE = 'https://www.molexces.com/'
const USER_AGENT = 'Mozilla/5.0 (compatible; CrossBorderProductImporter/0.1; +local-draft)'

const LOCALES = [
  { code: 'en', label: 'English', trade_region: 'Global / North America / ASEAN', dir: 'ltr' },
  { code: 'zh-CN', label: '简体中文', trade_region: 'China operations / supplier review', dir: 'ltr' },
  { code: 'es', label: 'Español', trade_region: 'Spain / Latin America', dir: 'ltr' },
  { code: 'fr', label: 'Français', trade_region: 'France / Francophone Africa', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', trade_region: 'DACH / EU procurement', dir: 'ltr' },
  { code: 'pt-BR', label: 'Português', trade_region: 'Brazil / Lusophone markets', dir: 'ltr' },
  { code: 'ar', label: 'العربية', trade_region: 'Middle East / North Africa', dir: 'rtl' },
  { code: 'ru', label: 'Русский', trade_region: 'Russia / CIS', dir: 'ltr' },
  { code: 'pl', label: 'Polski', trade_region: 'Poland / Eastern Europe', dir: 'ltr' }
]

const UI_COPY = {
  en: {
    language_label: 'Language',
    brand_title: 'Private Label Connectivity',
    brand_subtitle: 'Draft product system built from authorized source products',
    nav_products: 'Products',
    nav_proof: 'Procurement Proof',
    nav_rfq: 'RFQ',
    request_quote: 'Request Quote',
    eyebrow: 'Structured cabling product draft',
    hero_title: 'Copper connectivity catalogue rebuilt for B2B procurement.',
    hero_body: 'Imported source products are rebuilt into a multilingual, solution-led catalogue for distributors, installers and OEM buyers.',
    build_rfq_pack: 'Build RFQ Pack',
    view_product_families: 'View Product Families',
    products_imported: 'Products imported',
    product_families: 'Product families',
    human_review_required: 'Human review required',
    external_publish_allowed: 'External publish allowed',
    draft: 'Draft',
    no: 'No',
    product_families_heading: 'Product Families',
    product_families_body: 'Category navigation follows the imported catalogue, while presentation is rebuilt for scanning, comparison and RFQ conversion.',
    imported_product_grid: 'Imported Product Grid',
    imported_product_body: 'Product cards use industry terms by market language. Certification, MOQ, pricing and lead time remain blocked until verified.',
    imported_products: 'imported products',
    grade: 'Grade',
    class: 'Class',
    to_be_confirmed: 'To be confirmed',
    source_traceability: 'Source Traceability',
    source_traceability_body: 'Each product record stores source URL, list page, original image URL and local image copy.',
    claim_guardrails: 'Claim Guardrails',
    claim_guardrails_body: 'Unverified certificates, standards, materials, MOQ, lead time and customer cases are marked as confirmation required.',
    reusable_ai_flow: 'Reusable AI Flow',
    reusable_ai_flow_body: 'The same import can feed classification, product pages, RFQ fields, quote preparation and content QA.',
    rfq_ready_structure: 'RFQ-ready structure',
    rfq_heading: 'Turn selected products into inquiry-ready packs.',
    rfq_body: 'The next stage can generate product pages, dynamic RFQ fields, missing-claim questions and quote preparation data from this catalogue.',
    field_product_family: 'Product family',
    field_target_grade: 'Target grade or category',
    field_quantity: 'Quantity, packaging and private-label request',
    field_destination: 'Destination country and compliance requirement',
    generate_inquiry: 'Generate Inquiry Draft',
    footer_note: 'Local draft only. No external publishing or customer communication is allowed.'
  },
  'zh-CN': {
    language_label: '语言',
    brand_title: '自有品牌连接产品',
    brand_subtitle: '基于授权源头产品构建的草稿目录系统',
    nav_products: '产品',
    nav_proof: '采购信任',
    nav_rfq: '询盘',
    request_quote: '请求报价',
    eyebrow: '结构化布线产品草稿',
    hero_title: '面向 B2B 采购重构的铜缆连接产品目录。',
    hero_body: '源头产品已重构为多语言、解决方案导向的目录，面向分销商、安装商与 OEM 买家。',
    build_rfq_pack: '生成询盘包',
    view_product_families: '查看产品系列',
    products_imported: '已导入产品',
    product_families: '产品系列',
    human_review_required: '需要人工确认',
    external_publish_allowed: '允许外部发布',
    draft: '草稿',
    no: '否',
    product_families_heading: '产品系列',
    product_families_body: '分类导航沿用导入目录，展示方式重构为便于浏览、比较和询盘转化的 B2B 结构。',
    imported_product_grid: '导入产品列表',
    imported_product_body: '产品卡片按市场语言使用行业术语。证书、MOQ、价格与交期在核实前保持阻断。',
    imported_products: '个已导入产品',
    grade: '等级',
    class: '分类',
    to_be_confirmed: '待确认',
    source_traceability: '来源可追溯',
    source_traceability_body: '每个产品记录保留来源链接、列表页、原始图片链接和本地图片副本。',
    claim_guardrails: '声明保护',
    claim_guardrails_body: '未核实的证书、标准、材料、MOQ、交期和客户案例全部标记为需要确认。',
    reusable_ai_flow: '可复用 AI 流程',
    reusable_ai_flow_body: '同一导入结果可继续进入分类、产品页、RFQ 字段、报价准备和内容 QA。',
    rfq_ready_structure: '询盘就绪结构',
    rfq_heading: '将选定产品转为可询盘资料包。',
    rfq_body: '下一阶段可基于该目录生成产品页、动态 RFQ 字段、缺失信息问题和报价准备数据。',
    field_product_family: '产品系列',
    field_target_grade: '目标等级或品类',
    field_quantity: '数量、包装与私标要求',
    field_destination: '目的国与合规要求',
    generate_inquiry: '生成询盘草稿',
    footer_note: '仅本地草稿。不会对外发布或联系客户。'
  },
  es: {
    language_label: 'Idioma',
    brand_title: 'Conectividad de Marca Privada',
    brand_subtitle: 'Sistema de productos basado en fuentes autorizadas',
    nav_products: 'Productos',
    nav_proof: 'Prueba de compra',
    nav_rfq: 'RFQ',
    request_quote: 'Solicitar cotización',
    eyebrow: 'Borrador de cableado estructurado',
    hero_title: 'Catálogo de conectividad de cobre reconstruido para compras B2B.',
    hero_body: 'Los productos fuente se presentan como catálogo multilingüe orientado a distribuidores, instaladores y compradores OEM.',
    build_rfq_pack: 'Crear paquete RFQ',
    view_product_families: 'Ver familias',
    products_imported: 'Productos importados',
    product_families: 'Familias de producto',
    human_review_required: 'Revisión humana requerida',
    external_publish_allowed: 'Publicación externa permitida',
    draft: 'Borrador',
    no: 'No',
    product_families_heading: 'Familias de Producto',
    product_families_body: 'La navegación sigue el catálogo importado y se adapta para comparación y conversión RFQ.',
    imported_product_grid: 'Lista de Productos Importados',
    imported_product_body: 'Las fichas usan terminología técnica por mercado. Certificados, MOQ, precios y plazos requieren verificación.',
    imported_products: 'productos importados',
    grade: 'Grado',
    class: 'Clase',
    to_be_confirmed: 'Por confirmar',
    source_traceability: 'Trazabilidad de Fuente',
    source_traceability_body: 'Cada producto conserva URL de origen, página de lista, imagen original y copia local.',
    claim_guardrails: 'Control de Declaraciones',
    claim_guardrails_body: 'Certificados, normas, materiales, MOQ, plazos y casos no verificados quedan marcados para confirmación.',
    reusable_ai_flow: 'Flujo AI Reutilizable',
    reusable_ai_flow_body: 'La importación alimenta clasificación, páginas, RFQ, preparación de cotización y QA.',
    rfq_ready_structure: 'Estructura lista para RFQ',
    rfq_heading: 'Convierte productos seleccionados en paquetes de consulta.',
    rfq_body: 'La siguiente etapa puede generar páginas, campos RFQ dinámicos, preguntas faltantes y datos para cotización.',
    field_product_family: 'Familia de producto',
    field_target_grade: 'Grado o categoría objetivo',
    field_quantity: 'Cantidad, embalaje y marca privada',
    field_destination: 'País destino y requisitos de cumplimiento',
    generate_inquiry: 'Generar borrador de consulta',
    footer_note: 'Borrador local. Sin publicación externa ni comunicación con clientes.'
  },
  fr: {
    language_label: 'Langue',
    brand_title: 'Connectivité en Marque Privée',
    brand_subtitle: 'Système produit issu de sources autorisées',
    nav_products: 'Produits',
    nav_proof: 'Preuves achat',
    nav_rfq: 'RFQ',
    request_quote: 'Demander un devis',
    eyebrow: 'Brouillon câblage structuré',
    hero_title: 'Catalogue de connectivité cuivre reconstruit pour les achats B2B.',
    hero_body: 'Les produits source deviennent un catalogue multilingue pour distributeurs, installateurs et acheteurs OEM.',
    build_rfq_pack: 'Créer pack RFQ',
    view_product_families: 'Voir familles',
    products_imported: 'Produits importés',
    product_families: 'Familles produit',
    human_review_required: 'Validation humaine requise',
    external_publish_allowed: 'Publication externe autorisée',
    draft: 'Brouillon',
    no: 'Non',
    product_families_heading: 'Familles Produit',
    product_families_body: 'La navigation suit le catalogue importé et la présentation facilite lecture, comparaison et RFQ.',
    imported_product_grid: 'Grille Produits Importés',
    imported_product_body: 'Les fiches utilisent des termes métier par langue. Certifications, MOQ, prix et délais restent à vérifier.',
    imported_products: 'produits importés',
    grade: 'Grade',
    class: 'Classe',
    to_be_confirmed: 'À confirmer',
    source_traceability: 'Traçabilité Source',
    source_traceability_body: 'Chaque fiche conserve URL source, page liste, image originale et copie locale.',
    claim_guardrails: 'Garde-fous Claims',
    claim_guardrails_body: 'Certificats, normes, matériaux, MOQ, délais et références non vérifiés exigent confirmation.',
    reusable_ai_flow: 'Flux AI Réutilisable',
    reusable_ai_flow_body: 'La même importation alimente classification, pages produit, RFQ, devis et QA.',
    rfq_ready_structure: 'Structure prête RFQ',
    rfq_heading: 'Transformez les produits sélectionnés en packs de demande.',
    rfq_body: 'L’étape suivante génère pages, champs RFQ dynamiques, questions manquantes et données de devis.',
    field_product_family: 'Famille produit',
    field_target_grade: 'Grade ou catégorie cible',
    field_quantity: 'Quantité, emballage et marque privée',
    field_destination: 'Pays destination et conformité',
    generate_inquiry: 'Générer demande',
    footer_note: 'Brouillon local uniquement. Aucune publication ni communication client.'
  },
  de: {
    language_label: 'Sprache',
    brand_title: 'Private-Label-Konnektivität',
    brand_subtitle: 'Produktsystem aus autorisierten Quelldaten',
    nav_products: 'Produkte',
    nav_proof: 'Einkaufsnachweis',
    nav_rfq: 'RFQ',
    request_quote: 'Angebot anfragen',
    eyebrow: 'Entwurf strukturierte Verkabelung',
    hero_title: 'Kupfer-Konnektivitätskatalog für B2B-Beschaffung neu aufgebaut.',
    hero_body: 'Quellprodukte werden zu einem mehrsprachigen, lösungsorientierten Katalog für Distributoren, Installateure und OEM-Käufer.',
    build_rfq_pack: 'RFQ-Paket erstellen',
    view_product_families: 'Familien anzeigen',
    products_imported: 'Importierte Produkte',
    product_families: 'Produktfamilien',
    human_review_required: 'Menschliche Prüfung erforderlich',
    external_publish_allowed: 'Externe Veröffentlichung erlaubt',
    draft: 'Entwurf',
    no: 'Nein',
    product_families_heading: 'Produktfamilien',
    product_families_body: 'Die Navigation folgt dem importierten Katalog und ist für Vergleich und RFQ optimiert.',
    imported_product_grid: 'Importierte Produktliste',
    imported_product_body: 'Produktkarten nutzen Fachbegriffe je Markt. Zertifikate, MOQ, Preise und Lieferzeit bleiben ungeprüft.',
    imported_products: 'importierte Produkte',
    grade: 'Kategorie',
    class: 'Klasse',
    to_be_confirmed: 'Zu bestätigen',
    source_traceability: 'Quellnachweis',
    source_traceability_body: 'Jeder Datensatz speichert Quell-URL, Listenseite, Originalbild und lokale Kopie.',
    claim_guardrails: 'Claim-Schutz',
    claim_guardrails_body: 'Ungeprüfte Zertifikate, Normen, Materialien, MOQ, Lieferzeit und Referenzen benötigen Bestätigung.',
    reusable_ai_flow: 'Wiederverwendbarer AI-Flow',
    reusable_ai_flow_body: 'Der Import speist Klassifikation, Produktseiten, RFQ-Felder, Angebotsvorbereitung und QA.',
    rfq_ready_structure: 'RFQ-bereite Struktur',
    rfq_heading: 'Ausgewählte Produkte in Anfragepakete umwandeln.',
    rfq_body: 'Der nächste Schritt erzeugt Seiten, RFQ-Felder, Rückfragen und Angebotsdaten.',
    field_product_family: 'Produktfamilie',
    field_target_grade: 'Zielkategorie oder Klasse',
    field_quantity: 'Menge, Verpackung und Private Label',
    field_destination: 'Zielland und Compliance',
    generate_inquiry: 'Anfrageentwurf erzeugen',
    footer_note: 'Nur lokaler Entwurf. Keine Veröffentlichung oder Kundenkommunikation.'
  },
  'pt-BR': {
    language_label: 'Idioma',
    brand_title: 'Conectividade Private Label',
    brand_subtitle: 'Sistema de produtos com fonte autorizada',
    nav_products: 'Produtos',
    nav_proof: 'Prova de compra',
    nav_rfq: 'RFQ',
    request_quote: 'Solicitar cotação',
    eyebrow: 'Rascunho de cabeamento estruturado',
    hero_title: 'Catálogo de conectividade de cobre reconstruído para compras B2B.',
    hero_body: 'Produtos fonte viram catálogo multilíngue para distribuidores, instaladores e compradores OEM.',
    build_rfq_pack: 'Criar pacote RFQ',
    view_product_families: 'Ver famílias',
    products_imported: 'Produtos importados',
    product_families: 'Famílias de produto',
    human_review_required: 'Revisão humana obrigatória',
    external_publish_allowed: 'Publicação externa permitida',
    draft: 'Rascunho',
    no: 'Não',
    product_families_heading: 'Famílias de Produto',
    product_families_body: 'A navegação segue o catálogo importado e a apresentação é otimizada para comparação e RFQ.',
    imported_product_grid: 'Grade de Produtos Importados',
    imported_product_body: 'Os cards usam termos técnicos por idioma. Certificados, MOQ, preços e prazo exigem verificação.',
    imported_products: 'produtos importados',
    grade: 'Categoria',
    class: 'Classe',
    to_be_confirmed: 'A confirmar',
    source_traceability: 'Rastreabilidade da Fonte',
    source_traceability_body: 'Cada registro guarda URL de origem, página de lista, imagem original e cópia local.',
    claim_guardrails: 'Controle de Declarações',
    claim_guardrails_body: 'Certificados, normas, materiais, MOQ, prazo e casos não verificados ficam bloqueados.',
    reusable_ai_flow: 'Fluxo AI Reutilizável',
    reusable_ai_flow_body: 'A importação alimenta classificação, páginas, RFQ, cotação e QA.',
    rfq_ready_structure: 'Estrutura pronta para RFQ',
    rfq_heading: 'Transforme produtos selecionados em pacotes de consulta.',
    rfq_body: 'A próxima etapa pode gerar páginas, campos RFQ, perguntas faltantes e dados para cotação.',
    field_product_family: 'Família de produto',
    field_target_grade: 'Grau ou categoria alvo',
    field_quantity: 'Quantidade, embalagem e private label',
    field_destination: 'País destino e conformidade',
    generate_inquiry: 'Gerar rascunho de consulta',
    footer_note: 'Apenas rascunho local. Sem publicação externa ou contato com clientes.'
  },
  ar: {
    language_label: 'اللغة',
    brand_title: 'منتجات ربط بعلامة خاصة',
    brand_subtitle: 'نظام منتجات مبني من مصادر معتمدة',
    nav_products: 'المنتجات',
    nav_proof: 'إثبات الشراء',
    nav_rfq: 'طلب عرض',
    request_quote: 'طلب عرض سعر',
    eyebrow: 'مسودة منتجات الكابلات المنظمة',
    hero_title: 'كتالوج توصيلات نحاسية معاد بناؤه للمشتريات B2B.',
    hero_body: 'تم تحويل المنتجات المصدرية إلى كتالوج متعدد اللغات للموزعين والمركبين ومشتري OEM.',
    build_rfq_pack: 'إنشاء حزمة RFQ',
    view_product_families: 'عرض العائلات',
    products_imported: 'منتجات مستوردة',
    product_families: 'عائلات المنتجات',
    human_review_required: 'تحتاج مراجعة بشرية',
    external_publish_allowed: 'النشر الخارجي مسموح',
    draft: 'مسودة',
    no: 'لا',
    product_families_heading: 'عائلات المنتجات',
    product_families_body: 'التنقل يتبع الكتالوج المستورد مع عرض مناسب للمقارنة وطلبات RFQ.',
    imported_product_grid: 'قائمة المنتجات المستوردة',
    imported_product_body: 'تستخدم البطاقات مصطلحات تقنية حسب اللغة. الشهادات والحد الأدنى والسعر والمهلة قيد التحقق.',
    imported_products: 'منتج مستورد',
    grade: 'الفئة',
    class: 'التصنيف',
    to_be_confirmed: 'بانتظار التأكيد',
    source_traceability: 'تتبع المصدر',
    source_traceability_body: 'كل سجل يحتفظ برابط المصدر وصفحة القائمة والصورة الأصلية ونسخة محلية.',
    claim_guardrails: 'ضوابط الادعاءات',
    claim_guardrails_body: 'الشهادات والمعايير والمواد والحد الأدنى والمهلة والحالات غير المؤكدة تحتاج تأكيداً.',
    reusable_ai_flow: 'تدفق AI قابل لإعادة الاستخدام',
    reusable_ai_flow_body: 'نفس الاستيراد يغذي التصنيف وصفحات المنتج وحقول RFQ وتحضير السعر وQA.',
    rfq_ready_structure: 'هيكل جاهز لـ RFQ',
    rfq_heading: 'حوّل المنتجات المحددة إلى حزم استفسار.',
    rfq_body: 'المرحلة التالية تنشئ صفحات وحقول RFQ وأسئلة ناقصة وبيانات عرض سعر.',
    field_product_family: 'عائلة المنتج',
    field_target_grade: 'الفئة أو الدرجة المطلوبة',
    field_quantity: 'الكمية والتغليف والعلامة الخاصة',
    field_destination: 'بلد الوجهة ومتطلبات الامتثال',
    generate_inquiry: 'إنشاء مسودة استفسار',
    footer_note: 'مسودة محلية فقط. لا نشر خارجي ولا تواصل مع العملاء.'
  },
  ru: {
    language_label: 'Язык',
    brand_title: 'Подключение под частной маркой',
    brand_subtitle: 'Система товаров из авторизованных источников',
    nav_products: 'Товары',
    nav_proof: 'Доказательства',
    nav_rfq: 'RFQ',
    request_quote: 'Запросить цену',
    eyebrow: 'Черновик структурированной кабельной системы',
    hero_title: 'Каталог медной коммутации для B2B-закупок.',
    hero_body: 'Исходные товары преобразованы в многоязычный каталог для дистрибьюторов, монтажников и OEM-покупателей.',
    build_rfq_pack: 'Создать RFQ-пакет',
    view_product_families: 'Смотреть группы',
    products_imported: 'Импортированные товары',
    product_families: 'Группы товаров',
    human_review_required: 'Требуется проверка',
    external_publish_allowed: 'Внешняя публикация разрешена',
    draft: 'Черновик',
    no: 'Нет',
    product_families_heading: 'Группы Товаров',
    product_families_body: 'Навигация следует импортированному каталогу и оптимизирована для сравнения и RFQ.',
    imported_product_grid: 'Список Импортированных Товаров',
    imported_product_body: 'Карточки используют отраслевые термины. Сертификаты, MOQ, цена и срок поставки требуют проверки.',
    imported_products: 'импортированных товаров',
    grade: 'Категория',
    class: 'Класс',
    to_be_confirmed: 'Требует подтверждения',
    source_traceability: 'Прослеживаемость Источника',
    source_traceability_body: 'Каждая запись хранит URL источника, страницу списка, оригинальное изображение и локальную копию.',
    claim_guardrails: 'Контроль Заявлений',
    claim_guardrails_body: 'Непроверенные сертификаты, стандарты, материалы, MOQ, сроки и кейсы требуют подтверждения.',
    reusable_ai_flow: 'Переиспользуемый AI-процесс',
    reusable_ai_flow_body: 'Импорт питает классификацию, страницы, RFQ, подготовку цены и QA.',
    rfq_ready_structure: 'Структура для RFQ',
    rfq_heading: 'Преобразуйте выбранные товары в пакет запроса.',
    rfq_body: 'Следующий этап создаёт страницы, RFQ-поля, вопросы по пробелам и данные для расчёта.',
    field_product_family: 'Группа товара',
    field_target_grade: 'Целевая категория или класс',
    field_quantity: 'Количество, упаковка и private label',
    field_destination: 'Страна назначения и требования',
    generate_inquiry: 'Создать черновик запроса',
    footer_note: 'Только локальный черновик. Без публикации и контакта с клиентами.'
  },
  pl: {
    language_label: 'Język',
    brand_title: 'Łączność Private Label',
    brand_subtitle: 'System produktów z autoryzowanych źródeł',
    nav_products: 'Produkty',
    nav_proof: 'Dowody zakupu',
    nav_rfq: 'RFQ',
    request_quote: 'Poproś o wycenę',
    eyebrow: 'Projekt okablowania strukturalnego',
    hero_title: 'Katalog łączności miedzianej przebudowany pod zakupy B2B.',
    hero_body: 'Produkty źródłowe stają się wielojęzycznym katalogiem dla dystrybutorów, instalatorów i kupców OEM.',
    build_rfq_pack: 'Utwórz pakiet RFQ',
    view_product_families: 'Zobacz rodziny',
    products_imported: 'Importowane produkty',
    product_families: 'Rodziny produktów',
    human_review_required: 'Wymagana weryfikacja',
    external_publish_allowed: 'Publikacja zewnętrzna dozwolona',
    draft: 'Projekt',
    no: 'Nie',
    product_families_heading: 'Rodziny Produktów',
    product_families_body: 'Nawigacja bazuje na katalogu importowanym, a układ wspiera porównanie i RFQ.',
    imported_product_grid: 'Lista Importowanych Produktów',
    imported_product_body: 'Karty używają terminologii branżowej. Certyfikaty, MOQ, cena i termin wymagają potwierdzenia.',
    imported_products: 'importowanych produktów',
    grade: 'Kategoria',
    class: 'Klasa',
    to_be_confirmed: 'Do potwierdzenia',
    source_traceability: 'Śledzenie Źródła',
    source_traceability_body: 'Każdy rekord zachowuje URL źródłowy, stronę listy, obraz oryginalny i kopię lokalną.',
    claim_guardrails: 'Kontrola Deklaracji',
    claim_guardrails_body: 'Niezweryfikowane certyfikaty, normy, materiały, MOQ, terminy i referencje wymagają potwierdzenia.',
    reusable_ai_flow: 'Wielokrotnego Użytku AI Flow',
    reusable_ai_flow_body: 'Import zasila klasyfikację, strony, RFQ, przygotowanie wyceny i QA.',
    rfq_ready_structure: 'Struktura gotowa do RFQ',
    rfq_heading: 'Zmień wybrane produkty w pakiety zapytania.',
    rfq_body: 'Następny etap tworzy strony, pola RFQ, pytania brakujące i dane do wyceny.',
    field_product_family: 'Rodzina produktu',
    field_target_grade: 'Docelowa kategoria lub klasa',
    field_quantity: 'Ilość, opakowanie i private label',
    field_destination: 'Kraj docelowy i zgodność',
    generate_inquiry: 'Utwórz projekt zapytania',
    footer_note: 'Tylko lokalny projekt. Bez publikacji i kontaktu z klientami.'
  }
}

Object.assign(UI_COPY.en, {
  nav_advantages: 'Advantages',
  nav_contact: 'Contact',
  advantages_label: 'Manufacturing flexibility',
  advantages_heading: 'Flexible sourcing for private-label and custom structured cabling orders.',
  advantages_body: 'The catalogue is prepared for distributor, installer and OEM buying scenarios where price, label, packaging and model details change with order quantity and verified product scope.',
  advantage_qty_title: 'Quantity-based price movement',
  advantage_qty_body: 'Unit price can be adjusted by order quantity, packaging, destination and production batch. Final quotation remains gated by verified cost and logistics data.',
  advantage_label_title: 'Brand label support',
  advantage_label_body: 'Private-label stickers, product labels, packaging marks and buyer-specific catalogue naming can be prepared after brand policy confirmation.',
  advantage_model_title: 'Special model customization',
  advantage_model_body: 'Selected product families can support custom part numbers, wiring schemes, panel layouts, color/port options or buyer-specific model names.',
  advantage_product_title: 'Custom product requirements',
  advantage_product_body: 'Non-standard accessories, kits, packaging sets and application-specific variants can enter a review flow before sampling or quotation.',
  contact_label: 'Contact channels',
  contact_heading: 'Keep every inquiry reachable from one draft contact surface.',
  contact_body: 'Email, address and social channels are placeholders in this draft. Replace them with verified company information before publishing.',
  contact_email_label: 'Email',
  contact_address_label: 'Address',
  contact_social_label: 'Social channels',
  contact_pending: 'Pending final brand confirmation',
  chat_contact_title: 'Direct contact',
  chat_contact_note: 'Use these channels after the account details are verified.'
})

Object.assign(UI_COPY['zh-CN'], {
  nav_advantages: '优势',
  nav_contact: '联系',
  advantages_label: '源头与定制能力',
  advantages_heading: '面向私标、定制和批量采购的灵活供货能力。',
  advantages_body: '当前目录按分销商、安装商和 OEM 买家的采购场景组织，价格、标签、包装和型号细节都可以随数量和核实后的产品范围调整。',
  advantage_qty_title: '数量影响价格',
  advantage_qty_body: '单价可根据订单数量、包装方式、目的国和生产批次浮动。最终报价仍需经过成本与物流数据核实。',
  advantage_label_title: '支持品牌标签',
  advantage_label_body: '可准备私标贴纸、产品标签、包装标识和买家专属目录命名，正式发布前需要确认品牌规则。',
  advantage_model_title: '支持特殊型号定制',
  advantage_model_body: '部分产品系列可进入定制型号、线序、面板布局、颜色/端口组合或客户专属型号名称的评估流程。',
  advantage_product_title: '支持定制类产品',
  advantage_product_body: '非标准配件、套装、包装组合和特定应用版本，可先进入需求评估，再进入打样或报价流程。',
  contact_label: '联系方式',
  contact_heading: '让每一次询盘都能进入统一的联系入口。',
  contact_body: '当前邮箱、地址和社媒账号为待确认占位信息。正式发布前，需要替换为已经核实的公司资料。',
  contact_email_label: '邮箱',
  contact_address_label: '通讯地址',
  contact_social_label: '社媒与通讯方式',
  contact_pending: '待最终品牌确认',
  chat_contact_title: '直接联系',
  chat_contact_note: '账号信息核实后，可启用这些联系入口。'
})

const CONTACT_PROFILE = {
  email: 'sales@brand-domain.com',
  address: 'China export office / factory address to be confirmed',
  social: [
    { key: 'facebook', label: 'Facebook', url: '#facebook-link-to-confirm' },
    { key: 'linkedin', label: 'LinkedIn', url: '#linkedin-link-to-confirm' },
    { key: 'wechat', label: 'WeChat', url: '#wechat-id-to-confirm' },
    { key: 'x-twitter', label: 'X / Twitter', url: '#twitter-link-to-confirm' },
    { key: 'whatsapp', label: 'WhatsApp', url: '#whatsapp-link-to-confirm' }
  ]
}

const CHAT_COPY = {
  en: {
    chat_open: 'Message',
    chat_title: 'Message Board',
    chat_subtitle: 'Leave a product inquiry draft for manual review.',
    chat_name: 'Name',
    chat_email: 'Email',
    chat_company: 'Company',
    chat_topic: 'Inquiry topic',
    chat_message: 'Message',
    chat_topic_sample: 'Sample request',
    chat_topic_distributor: 'Distributor inquiry',
    chat_topic_technical: 'Technical question',
    chat_topic_oem: 'OEM / private label',
    chat_send: 'Save Draft Message',
    chat_draft_notice: 'Local draft only. Nothing is sent externally.',
    chat_empty: 'No local messages yet.',
    chat_success: 'Draft saved for manual follow-up.',
    chat_clear: 'Clear drafts',
    chat_status: 'Local lead draft'
  },
  'zh-CN': {
    chat_open: '留言',
    chat_title: '客户留言板',
    chat_subtitle: '留下产品询盘草稿，等待人工确认。',
    chat_name: '姓名',
    chat_email: '邮箱',
    chat_company: '公司',
    chat_topic: '咨询主题',
    chat_message: '留言内容',
    chat_topic_sample: '样品申请',
    chat_topic_distributor: '分销合作',
    chat_topic_technical: '技术问题',
    chat_topic_oem: 'OEM / 私标',
    chat_send: '保存留言草稿',
    chat_draft_notice: '仅保存本地草稿，不会对外发送。',
    chat_empty: '暂无本地留言。',
    chat_success: '草稿已保存，等待人工跟进。',
    chat_clear: '清空草稿',
    chat_status: '本地线索草稿'
  },
  es: {
    chat_open: 'Mensaje',
    chat_title: 'Tablón de Mensajes',
    chat_subtitle: 'Deje un borrador de consulta para revisión manual.',
    chat_name: 'Nombre',
    chat_email: 'Email',
    chat_company: 'Empresa',
    chat_topic: 'Tema',
    chat_message: 'Mensaje',
    chat_topic_sample: 'Solicitud de muestra',
    chat_topic_distributor: 'Consulta distribuidor',
    chat_topic_technical: 'Pregunta técnica',
    chat_topic_oem: 'OEM / marca privada',
    chat_send: 'Guardar borrador',
    chat_draft_notice: 'Borrador local. No se envía externamente.',
    chat_empty: 'Sin mensajes locales.',
    chat_success: 'Borrador guardado para seguimiento manual.',
    chat_clear: 'Borrar borradores',
    chat_status: 'Lead local'
  },
  fr: {
    chat_open: 'Message',
    chat_title: 'Tableau de Messages',
    chat_subtitle: 'Laissez une demande produit pour validation manuelle.',
    chat_name: 'Nom',
    chat_email: 'Email',
    chat_company: 'Société',
    chat_topic: 'Sujet',
    chat_message: 'Message',
    chat_topic_sample: 'Demande échantillon',
    chat_topic_distributor: 'Demande distributeur',
    chat_topic_technical: 'Question technique',
    chat_topic_oem: 'OEM / marque privée',
    chat_send: 'Enregistrer brouillon',
    chat_draft_notice: 'Brouillon local. Aucun envoi externe.',
    chat_empty: 'Aucun message local.',
    chat_success: 'Brouillon enregistré pour suivi manuel.',
    chat_clear: 'Effacer brouillons',
    chat_status: 'Lead local'
  },
  de: {
    chat_open: 'Nachricht',
    chat_title: 'Nachrichtenboard',
    chat_subtitle: 'Produktanfrage als Entwurf zur Prüfung speichern.',
    chat_name: 'Name',
    chat_email: 'E-Mail',
    chat_company: 'Firma',
    chat_topic: 'Thema',
    chat_message: 'Nachricht',
    chat_topic_sample: 'Musteranfrage',
    chat_topic_distributor: 'Distributor-Anfrage',
    chat_topic_technical: 'Technische Frage',
    chat_topic_oem: 'OEM / Private Label',
    chat_send: 'Entwurf speichern',
    chat_draft_notice: 'Nur lokaler Entwurf. Kein externer Versand.',
    chat_empty: 'Noch keine lokalen Nachrichten.',
    chat_success: 'Entwurf für manuelle Nachverfolgung gespeichert.',
    chat_clear: 'Entwürfe löschen',
    chat_status: 'Lokaler Lead-Entwurf'
  },
  'pt-BR': {
    chat_open: 'Mensagem',
    chat_title: 'Mural de Mensagens',
    chat_subtitle: 'Deixe uma consulta de produto para revisão manual.',
    chat_name: 'Nome',
    chat_email: 'Email',
    chat_company: 'Empresa',
    chat_topic: 'Tema',
    chat_message: 'Mensagem',
    chat_topic_sample: 'Pedido de amostra',
    chat_topic_distributor: 'Consulta distribuidor',
    chat_topic_technical: 'Pergunta técnica',
    chat_topic_oem: 'OEM / private label',
    chat_send: 'Salvar rascunho',
    chat_draft_notice: 'Apenas rascunho local. Nada é enviado.',
    chat_empty: 'Sem mensagens locais.',
    chat_success: 'Rascunho salvo para acompanhamento manual.',
    chat_clear: 'Limpar rascunhos',
    chat_status: 'Lead local'
  },
  ar: {
    chat_open: 'رسالة',
    chat_title: 'لوحة الرسائل',
    chat_subtitle: 'اترك مسودة استفسار منتج للمراجعة اليدوية.',
    chat_name: 'الاسم',
    chat_email: 'البريد الإلكتروني',
    chat_company: 'الشركة',
    chat_topic: 'موضوع الاستفسار',
    chat_message: 'الرسالة',
    chat_topic_sample: 'طلب عينة',
    chat_topic_distributor: 'استفسار موزع',
    chat_topic_technical: 'سؤال فني',
    chat_topic_oem: 'OEM / علامة خاصة',
    chat_send: 'حفظ مسودة الرسالة',
    chat_draft_notice: 'مسودة محلية فقط. لا يتم الإرسال خارجياً.',
    chat_empty: 'لا توجد رسائل محلية بعد.',
    chat_success: 'تم حفظ المسودة للمتابعة اليدوية.',
    chat_clear: 'مسح المسودات',
    chat_status: 'مسودة عميل محلية'
  },
  ru: {
    chat_open: 'Сообщение',
    chat_title: 'Доска Сообщений',
    chat_subtitle: 'Оставьте черновик запроса для ручной проверки.',
    chat_name: 'Имя',
    chat_email: 'Email',
    chat_company: 'Компания',
    chat_topic: 'Тема запроса',
    chat_message: 'Сообщение',
    chat_topic_sample: 'Запрос образца',
    chat_topic_distributor: 'Запрос дистрибьютора',
    chat_topic_technical: 'Технический вопрос',
    chat_topic_oem: 'OEM / private label',
    chat_send: 'Сохранить черновик',
    chat_draft_notice: 'Только локальный черновик. Ничего не отправляется.',
    chat_empty: 'Локальных сообщений пока нет.',
    chat_success: 'Черновик сохранён для ручной обработки.',
    chat_clear: 'Очистить черновики',
    chat_status: 'Локальный лид'
  },
  pl: {
    chat_open: 'Wiadomość',
    chat_title: 'Tablica Wiadomości',
    chat_subtitle: 'Zostaw projekt zapytania do ręcznej weryfikacji.',
    chat_name: 'Imię',
    chat_email: 'Email',
    chat_company: 'Firma',
    chat_topic: 'Temat',
    chat_message: 'Wiadomość',
    chat_topic_sample: 'Prośba o próbkę',
    chat_topic_distributor: 'Zapytanie dystrybutora',
    chat_topic_technical: 'Pytanie techniczne',
    chat_topic_oem: 'OEM / private label',
    chat_send: 'Zapisz projekt',
    chat_draft_notice: 'Tylko lokalny projekt. Nic nie jest wysyłane.',
    chat_empty: 'Brak lokalnych wiadomości.',
    chat_success: 'Projekt zapisany do ręcznej obsługi.',
    chat_clear: 'Wyczyść projekty',
    chat_status: 'Lokalny lead'
  }
}

Object.assign(CHAT_COPY.en, {
  chat_ai_status: 'AI assistant draft mode',
  chat_ai_greeting: 'Ask about MOQ, standards, private label, lead time or target market fit. Replies stay as drafts until the AI service is connected.',
  chat_ai_note: 'Future AI replies route to lead capture, inquiry reception and quote preparation. Human takeover is always available.',
  chat_human_takeover: 'Request human takeover',
  chat_human_active: 'Human takeover requested. A sales operator can continue from the saved draft.',
  chat_moq: 'MOQ',
  chat_certificates: 'Certificates',
  chat_private_label: 'Private label',
  chat_lead_time: 'Lead time',
  chat_moq_template: 'Please provide MOQ, sample policy and tier pricing for this product family.',
  chat_certificates_template: 'Please confirm available certificates, test reports and recommended sales countries.',
  chat_private_label_template: 'I want to understand OEM / private-label packaging, labels and minimum order requirements.',
  chat_lead_time_template: 'Please share production lead time, packaging details and logistics suggestions for my destination country.',
  chat_empty_warning: 'Please leave at least one contact detail or inquiry message.'
})

Object.assign(CHAT_COPY['zh-CN'], {
  chat_ai_status: '站内 AI 草稿模式',
  chat_ai_greeting: '可咨询 MOQ、认证标准、私标、交期或适销市场。接入 AI 前，所有回复仅作为草稿。',
  chat_ai_note: '未来 AI 回复会进入线索、询盘接待和报价准备节点，人工可随时接管。',
  chat_human_takeover: '请求人工介入',
  chat_human_active: '已请求人工介入，销售人员可从当前草稿继续跟进。',
  chat_moq: 'MOQ',
  chat_certificates: '认证',
  chat_private_label: '私标',
  chat_lead_time: '交期',
  chat_moq_template: '请提供该产品系列的 MOQ、样品政策和阶梯价格。',
  chat_certificates_template: '请确认该产品可提供的认证、测试报告和推荐销售国家。',
  chat_private_label_template: '我需要了解 OEM / 私标包装、标签和最小起订要求。',
  chat_lead_time_template: '请提供生产交期、包装信息和到目的国的物流建议。',
  chat_empty_warning: '请至少留下一个联系方式或问题内容。'
})

const CATEGORY_TRANSLATIONS = {
  'KEYSTONE JACK': {
    'zh-CN': '信息模块',
    es: 'Módulo Keystone',
    fr: 'Prise Keystone',
    de: 'Keystone-Modul',
    'pt-BR': 'Módulo Keystone',
    ar: 'وحدة كيستون',
    ru: 'Модуль Keystone',
    pl: 'Moduł Keystone'
  },
  'PATCH PANEL': {
    'zh-CN': '配线架',
    es: 'Panel de Parcheo',
    fr: 'Panneau de Brassage',
    de: 'Patchpanel',
    'pt-BR': 'Patch Panel',
    ar: 'لوحة باتش',
    ru: 'Патч-панель',
    pl: 'Panel Krosowy'
  },
  'CABLE MANAGEMENT & 110 CABLING SYSTEM': {
    'zh-CN': '理线与 110 布线系统',
    es: 'Gestión de Cable y Sistema 110',
    fr: 'Gestion de Câbles et Système 110',
    de: 'Kabelmanagement und 110-System',
    'pt-BR': 'Gerenciamento de Cabos e Sistema 110',
    ar: 'إدارة الكابلات ونظام 110',
    ru: 'Кабель-менеджмент и система 110',
    pl: 'Organizacja Kabli i System 110'
  },
  'FACE PLATE': {
    'zh-CN': '信息面板',
    es: 'Placa Frontal',
    fr: 'Plaque Murale',
    de: 'Anschlussblende',
    'pt-BR': 'Espelho de Rede',
    ar: 'لوحة واجهة',
    ru: 'Лицевая панель',
    pl: 'Płytka Czołowa'
  },
  PLUG: {
    'zh-CN': '水晶头/插头',
    es: 'Conector',
    fr: 'Connecteur',
    de: 'Stecker',
    'pt-BR': 'Conector',
    ar: 'قابس',
    ru: 'Разъём',
    pl: 'Wtyk'
  },
  'PATCH CORD': {
    'zh-CN': '跳线',
    es: 'Latiguillo',
    fr: 'Cordon de Brassage',
    de: 'Patchkabel',
    'pt-BR': 'Patch Cord',
    ar: 'كابل باتش',
    ru: 'Патч-корд',
    pl: 'Patchcord'
  },
  'TELECOMMUNICATION ACCESSORIES': {
    'zh-CN': '通信配件',
    es: 'Accesorios de Telecomunicaciones',
    fr: 'Accessoires Télécom',
    de: 'Telekommunikationszubehör',
    'pt-BR': 'Acessórios de Telecom',
    ar: 'ملحقات اتصالات',
    ru: 'Телеком-аксессуары',
    pl: 'Akcesoria Telekomunikacyjne'
  },
  'POWER DISTRIBUTION UNIT (PDU)': {
    'zh-CN': '电源分配单元 PDU',
    es: 'Unidad de Distribución de Energía (PDU)',
    fr: 'Unité de Distribution Électrique (PDU)',
    de: 'Stromverteilerleiste (PDU)',
    'pt-BR': 'Unidade de Distribuição de Energia (PDU)',
    ar: 'وحدة توزيع الطاقة (PDU)',
    ru: 'Блок распределения питания (PDU)',
    pl: 'Listwa Zasilająca PDU'
  }
}

const CLASSIFICATION_TRANSLATIONS = {
  'Structured Cabling': {
    'zh-CN': '结构化布线',
    es: 'Cableado estructurado',
    fr: 'Câblage structuré',
    de: 'Strukturierte Verkabelung',
    'pt-BR': 'Cabeamento estruturado',
    ar: 'الكابلات المنظمة',
    ru: 'Структурированная кабельная система',
    pl: 'Okablowanie strukturalne'
  },
  'Copper Connectivity': {
    'zh-CN': '铜缆连接',
    es: 'Conectividad de cobre',
    fr: 'Connectivité cuivre',
    de: 'Kupfer-Konnektivität',
    'pt-BR': 'Conectividade de cobre',
    ar: 'توصيلات نحاسية',
    ru: 'Медная коммутация',
    pl: 'Łączność miedziana'
  },
  'Keystone Jacks': CATEGORY_TRANSLATIONS['KEYSTONE JACK'],
  'Patch Panels': CATEGORY_TRANSLATIONS['PATCH PANEL'],
  'Work Area Outlets': {
    'zh-CN': '工作区信息点',
    es: 'Tomas de área de trabajo',
    fr: 'Prises zone de travail',
    de: 'Arbeitsplatzanschlüsse',
    'pt-BR': 'Tomadas de área de trabalho',
    ar: 'مخارج منطقة العمل',
    ru: 'Розетки рабочего места',
    pl: 'Gniazda stanowiskowe'
  },
  'Face Plates': CATEGORY_TRANSLATIONS['FACE PLATE'],
  'Patch Cords': CATEGORY_TRANSLATIONS['PATCH CORD'],
  Infrastructure: {
    'zh-CN': '基础设施',
    es: 'Infraestructura',
    fr: 'Infrastructure',
    de: 'Infrastruktur',
    'pt-BR': 'Infraestrutura',
    ar: 'البنية التحتية',
    ru: 'Инфраструктура',
    pl: 'Infrastruktura'
  },
  'Power Distribution': {
    'zh-CN': '电源分配',
    es: 'Distribución de energía',
    fr: 'Distribution électrique',
    de: 'Stromverteilung',
    'pt-BR': 'Distribuição de energia',
    ar: 'توزيع الطاقة',
    ru: 'Распределение питания',
    pl: 'Dystrybucja zasilania'
  },
  Plugs: CATEGORY_TRANSLATIONS.PLUG,
  'Cable Management': {
    'zh-CN': '理线管理',
    es: 'Gestión de cable',
    fr: 'Gestion de câbles',
    de: 'Kabelmanagement',
    'pt-BR': 'Gerenciamento de cabos',
    ar: 'إدارة الكابلات',
    ru: 'Кабель-менеджмент',
    pl: 'Organizacja kabli'
  },
  '110 Cabling System': {
    'zh-CN': '110 布线系统',
    es: 'Sistema de cableado 110',
    fr: 'Système de câblage 110',
    de: '110-Verkabelungssystem',
    'pt-BR': 'Sistema de cabeamento 110',
    ar: 'نظام كابلات 110',
    ru: 'Кабельная система 110',
    pl: 'System okablowania 110'
  },
  Accessories: {
    'zh-CN': '配件',
    es: 'Accesorios',
    fr: 'Accessoires',
    de: 'Zubehör',
    'pt-BR': 'Acessórios',
    ar: 'ملحقات',
    ru: 'Аксессуары',
    pl: 'Akcesoria'
  }
}

const PRODUCT_TERM_TRANSLATIONS = {
  'Keystone Jack': {
    'zh-CN': '信息模块',
    es: 'módulo keystone',
    fr: 'prise keystone',
    de: 'Keystone-Modul',
    'pt-BR': 'módulo keystone',
    ar: 'وحدة كيستون',
    ru: 'модуль Keystone',
    pl: 'moduł Keystone'
  },
  'Patch Panel': {
    'zh-CN': '配线架',
    es: 'panel de parcheo',
    fr: 'panneau de brassage',
    de: 'Patchpanel',
    'pt-BR': 'patch panel',
    ar: 'لوحة باتش',
    ru: 'патч-панель',
    pl: 'panel krosowy'
  },
  'Face Plate': {
    'zh-CN': '信息面板',
    es: 'placa frontal',
    fr: 'plaque murale',
    de: 'Anschlussblende',
    'pt-BR': 'espelho de rede',
    ar: 'لوحة واجهة',
    ru: 'лицевая панель',
    pl: 'płytka czołowa'
  },
  'Patch Cord': {
    'zh-CN': '跳线',
    es: 'latiguillo',
    fr: 'cordon de brassage',
    de: 'Patchkabel',
    'pt-BR': 'patch cord',
    ar: 'كابل باتش',
    ru: 'патч-корд',
    pl: 'patchcord'
  },
  Toolless: {
    'zh-CN': '免工具',
    es: 'sin herramienta',
    fr: 'sans outil',
    de: 'werkzeuglos',
    'pt-BR': 'sem ferramenta',
    ar: 'بدون أدوات',
    ru: 'без инструмента',
    pl: 'beznarzędziowy'
  },
  Shielded: {
    'zh-CN': '屏蔽',
    es: 'blindado',
    fr: 'blindé',
    de: 'geschirmt',
    'pt-BR': 'blindado',
    ar: 'محمي',
    ru: 'экранированный',
    pl: 'ekranowany'
  },
  Unshielded: {
    'zh-CN': '非屏蔽',
    es: 'no blindado',
    fr: 'non blindé',
    de: 'ungeschirmt',
    'pt-BR': 'não blindado',
    ar: 'غير محمي',
    ru: 'неэкранированный',
    pl: 'nieekranowany'
  },
  'Cable Management': {
    'zh-CN': '理线管理',
    es: 'gestión de cable',
    fr: 'gestion de câbles',
    de: 'Kabelmanagement',
    'pt-BR': 'gerenciamento de cabos',
    ar: 'إدارة الكابلات',
    ru: 'кабель-менеджмент',
    pl: 'organizacja kabli'
  },
  'Surface Mount Box': {
    'zh-CN': '明装盒',
    es: 'caja de superficie',
    fr: 'boîtier saillie',
    de: 'Aufputzdose',
    'pt-BR': 'caixa de sobrepor',
    ar: 'علبة سطحية',
    ru: 'накладная коробка',
    pl: 'puszka natynkowa'
  },
  'Distribution Unit': {
    'zh-CN': '分配单元',
    es: 'unidad de distribución',
    fr: 'unité de distribution',
    de: 'Verteilereinheit',
    'pt-BR': 'unidade de distribuição',
    ar: 'وحدة توزيع',
    ru: 'блок распределения',
    pl: 'jednostka dystrybucyjna'
  },
  'Power': {
    'zh-CN': '电源',
    es: 'energía',
    fr: 'énergie',
    de: 'Strom',
    'pt-BR': 'energia',
    ar: 'طاقة',
    ru: 'питание',
    pl: 'zasilanie'
  }
}

function parseArgs(argv) {
  return argv.reduce((acc, item) => {
    if (!item.startsWith('--')) return acc
    const [rawKey, ...rest] = item.slice(2).split('=')
    acc[rawKey] = rest.length ? rest.join('=') : true
    return acc
  }, {})
}

function normalizeBase(url) {
  return url.endsWith('/') ? url : `${url}/`
}

function toAbsolute(href, baseUrl) {
  return new URL(href, baseUrl).toString()
}

function decodeEntities(value = '') {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
      if (entity[0] === '#') {
        const isHex = entity[1]?.toLowerCase() === 'x'
        const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : _
      }
      return named[entity.toLowerCase()] || _
    })
    .replace(/\u00a0/g, ' ')
}

function stripTags(html = '') {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value = '') {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function extractAttr(tag = '', attr) {
  const pattern = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i')
  return decodeEntities(tag.match(pattern)?.[1] || '')
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1]?.trim() || ''
}

function slug(value = 'item') {
  const cleaned = value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'item'
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml'
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  const bytes = await response.arrayBuffer()
  return new TextDecoder('utf-8').decode(bytes)
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function normalizeCategoryName(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/MANAGERMENT/gi, 'MANAGEMENT')
    .replace(/DISTRUBTION/gi, 'DISTRIBUTION')
    .trim()
}

function extractCategories(html, baseUrl) {
  const categories = new Map()
  const pattern = /<a\s+([^>]*href=["']products-(\d+)-0-1-\.html["'][^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while ((match = pattern.exec(html))) {
    const attrs = match[1]
    const href = extractAttr(attrs, 'href')
    const title = extractAttr(attrs, 'title') || stripTags(match[3])
    if (!href || !title || /products/i.test(title) || /chinese/i.test(title)) continue
    const normalizedTitle = normalizeCategoryName(title)
    const id = firstMatch(href, /products-(\d+)-/)
    categories.set(id, {
      source_category_id: id,
      source_title: title.trim(),
      category_name: normalizedTitle,
      source_url: toAbsolute(href, baseUrl)
    })
  }
  return [...categories.values()]
}

function extractPageUrls(html, category, baseUrl) {
  const urls = new Set([category.source_url])
  const pattern = new RegExp(`href=["']([^"']*products-${category.source_category_id}-0-(\\d+)-\\.html)["']`, 'gi')
  let match
  while ((match = pattern.exec(html))) {
    urls.add(toAbsolute(match[1], baseUrl))
  }
  return [...urls].sort((a, b) => {
    const pageA = Number(firstMatch(a, /-0-(\d+)-\.html/) || 1)
    const pageB = Number(firstMatch(b, /-0-(\d+)-\.html/) || 1)
    return pageA - pageB
  })
}

function extractProductLinks(html, category, pageUrl, baseUrl) {
  const products = new Map()
  const anchorPattern = /<a\s+([^>]*href=["']productshow-\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1]
    const inner = match[2]
    const href = extractAttr(attrs, 'href')
    const productId = firstMatch(href, /productshow-(\d+)\.html/i)
    if (!productId) continue

    const imageTag = inner.match(/<img\s+[^>]*>/i)?.[0] || ''
    const imageUrl = extractAttr(imageTag, 'src') || extractAttr(imageTag, 'data-original')
    const imageAlt = extractAttr(imageTag, 'alt')
    const title = extractAttr(attrs, 'title')
    const text = stripTags(inner)
    const code = firstMatch(`${title} ${imageAlt} ${text}`, /\b([A-Z]{2,}[A-Z0-9-]{2,})\b/)
    const previous = products.get(productId) || {}

    products.set(productId, {
      ...previous,
      source_product_id: productId,
      product_code: previous.product_code || code || title || imageAlt || text || `product-${productId}`,
      list_title: previous.list_title || title || imageAlt || text || '',
      category: category.category_name,
      source_category_id: category.source_category_id,
      source_category_title: category.source_title,
      source_url: toAbsolute(href, baseUrl),
      source_list_page: pageUrl,
      thumbnail_url: previous.thumbnail_url || (imageUrl ? toAbsolute(imageUrl, baseUrl) : '')
    })
  }
  return [...products.values()]
}

function parseSpecLines(text) {
  const specs = {}
  const lines = text
    .split(/\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9 /().+-]{1,40})\s*[:：]\s*(.+)$/)
    if (!match) continue
    const key = match[1].trim().replace(/\s+/g, '_').toLowerCase()
    const value = match[2].trim()
    if (key && value && !specs[key]) specs[key] = value
  }
  return specs
}

function extractDetail(product, html, baseUrl) {
  const introHtml = firstMatch(html, /<div class=['"][^'"]*product-intro[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i)
  const introH1 = stripTags(firstMatch(introHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
  const introCode = firstMatch(introH1, /\b([A-Z]{2,}[A-Z0-9-]{2,})\b/)
  const introText = stripTags(introHtml)
  const detailHtml = firstMatch(html, /id=["']product-details["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)
  const detailText = stripTags(detailHtml)

  const bigImages = []
  const imagePattern = /(?:data-src|src)=["']([^"']*\/uploadfile\/bigpro\/[^"']+)["']/gi
  let imageMatch
  while ((imageMatch = imagePattern.exec(html))) {
    bigImages.push(toAbsolute(imageMatch[1], baseUrl))
  }

  const specs = {
    ...parseSpecLines(introText),
    ...parseSpecLines(detailText)
  }
  const description = specs.description || firstMatch(introText, /Description\s*[:：]\s*([^\n]+)/i)
  const grade = specs.grade || firstMatch(introText, /Grade\s*[:：]\s*([^\n]+)/i)

  return {
    ...product,
    product_code: introCode || product.product_code,
    product_name: description || product.list_title || product.product_code,
    description: description || '',
    grade: grade || '',
    specs,
    detail_text: detailText,
    primary_image_url: bigImages[0] || product.thumbnail_url,
    gallery_image_urls: unique(bigImages),
    source_detail_fetched_at: nowIso()
  }
}

function classifyProduct(product) {
  const value = `${product.category} ${product.product_name} ${product.description}`.toLowerCase()
  if (value.includes('keystone')) return ['Structured Cabling', 'Copper Connectivity', 'Keystone Jacks']
  if (value.includes('patch panel')) return ['Structured Cabling', 'Copper Connectivity', 'Patch Panels']
  if (value.includes('face plate') || value.includes('faceplate')) return ['Structured Cabling', 'Work Area Outlets', 'Face Plates']
  if (value.includes('patch cord')) return ['Structured Cabling', 'Copper Connectivity', 'Patch Cords']
  if (value.includes('pdu') || value.includes('power')) return ['Infrastructure', 'Power Distribution', 'PDU']
  if (value.includes('plug')) return ['Structured Cabling', 'Copper Connectivity', 'Plugs']
  if (value.includes('cable manager') || value.includes('110')) return ['Structured Cabling', 'Cable Management', '110 Cabling System']
  return ['Structured Cabling', 'Accessories', product.category || 'Unclassified']
}

function localeCodes() {
  return LOCALES.map((locale) => locale.code)
}

function mergedUiCopy() {
  return localeCodes().reduce((acc, locale) => {
    acc[locale] = {
      ...(UI_COPY[locale] || {}),
      ...(CHAT_COPY[locale] || {})
    }
    return acc
  }, {})
}

function localeText(locale, key) {
  return UI_COPY[locale]?.[key] || UI_COPY.en[key] || key
}

function translateMappedValue(value, locale, map) {
  if (locale === 'en') return value
  return map[value]?.[locale] || value
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function translateProductText(value = '', locale) {
  if (locale === 'en' || !value) return value || ''
  let result = value
  const terms = Object.keys(PRODUCT_TERM_TRANSLATIONS).sort((a, b) => b.length - a.length)
  for (const term of terms) {
    const translated = PRODUCT_TERM_TRANSLATIONS[term]?.[locale]
    if (!translated) continue
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi')
    result = result.replace(pattern, translated)
  }
  result = result
    .replace(/\bCAT\s?3\b/gi, locale === 'zh-CN' ? 'CAT3 三类' : 'Cat.3')
    .replace(/\bCAT\s?5E\b/gi, locale === 'zh-CN' ? 'CAT5E 超五类' : 'Cat.5e')
    .replace(/\bCAT\s?6A\b/gi, locale === 'zh-CN' ? 'CAT6A 六类增强' : 'Cat.6A')
    .replace(/\bCAT\s?6\b/gi, locale === 'zh-CN' ? 'CAT6 六类' : 'Cat.6')
    .replace(/\bUTP\b/g, locale === 'zh-CN' ? 'UTP 非屏蔽' : 'UTP')
    .replace(/\bFTP\b/g, locale === 'zh-CN' ? 'FTP 屏蔽' : 'FTP')
    .replace(/\bSTP\b/g, locale === 'zh-CN' ? 'STP 屏蔽' : 'STP')
    .replace(/\bIDC\b/g, locale === 'zh-CN' ? 'IDC 端接' : 'IDC')
    .replace(/\bRJ45\b/g, 'RJ45')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return result || value
}

function translateGrade(value = '', locale) {
  if (!value) return localeText(locale, 'to_be_confirmed')
  return translateProductText(value, locale)
}

function buildLocalizedProduct(product) {
  const classification = classifyProduct(product)
  return localeCodes().reduce((acc, locale) => {
    acc[locale] = {
      category: translateMappedValue(product.category, locale, CATEGORY_TRANSLATIONS),
      product_name: translateProductText(product.product_name || product.description || 'Product specification to be confirmed.', locale),
      grade: translateGrade(product.grade || product.specs?.grade || '', locale),
      classification: classification
        .map((item) => translateMappedValue(item, locale, CLASSIFICATION_TRANSLATIONS))
        .join(' / ')
    }
    return acc
  }, {})
}

function buildLocalization({ products, categories }) {
  const ui = mergedUiCopy()
  return {
    contract: 'localized_product_copy.v1',
    generated_at: nowIso(),
    default_locale: 'en',
    locales: LOCALES.reduce((acc, locale) => {
      acc[locale.code] = locale
      return acc
    }, {}),
    ui,
    categories: categories.reduce((acc, category) => {
      acc[category.source_category_id] = localeCodes().reduce((labels, locale) => {
        labels[locale] = translateMappedValue(category.category_name, locale, CATEGORY_TRANSLATIONS)
        return labels
      }, {})
      return acc
    }, {}),
    products: products.reduce((acc, product) => {
      acc[product.source_product_id] = buildLocalizedProduct(product)
      return acc
    }, {})
  }
}

function safeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

async function downloadPrimaryImage(product, assetsDir) {
  const url = product.primary_image_url || product.thumbnail_url
  if (!url) return product
  const pathname = new URL(url).pathname
  const ext = extname(pathname) || '.jpg'
  const fileName = `${slug(product.product_code || 'product')}-${product.source_product_id}${ext}`
  const absPath = join(assetsDir, fileName)
  try {
    if (!existsSync(absPath)) {
      const buffer = await fetchBuffer(url)
      writeFileSync(absPath, buffer)
    }
    return {
      ...product,
      local_primary_image: projectRelative(absPath)
    }
  } catch (error) {
    return {
      ...product,
      image_download_error: error.message
    }
  }
}

function syncPageProductImages(products, pageDir) {
  const pageAssetsDir = join(pageDir, 'assets', 'products')
  ensureDir(pageAssetsDir)
  for (const product of products) {
    if (!product.local_primary_image) continue
    const sourcePath = join(projectRoot, product.local_primary_image)
    if (!existsSync(sourcePath)) continue
    const ext = extname(sourcePath) || '.jpg'
    const fileName = `${slug(product.product_code || 'product')}-${product.source_product_id}${ext}`
    const targetPath = join(pageAssetsDir, fileName)
    copyFileSync(sourcePath, targetPath)
    product.page_primary_image = relative(pageDir, targetPath).replaceAll('\\', '/')
    product.page_primary_image_file = projectRelative(targetPath)
  }
}

function buildSiteDraftHtml({ products, categories, pageDir, generatedAt, sourceUrl, referenceUrl, localization }) {
  const featured = products
  const defaultUi = mergedUiCopy().en
  const localePayload = localization || buildLocalization({ products, categories })
  const localeJson = safeScriptJson(localePayload)
  const localeOptions = LOCALES.map((locale) =>
    `<option value="${escapeAttr(locale.code)}">${escapeHtml(locale.label)} · ${escapeHtml(locale.trade_region)}</option>`
  ).join('')
  const firstImage = featured.find((item) => item.local_primary_image)
  const heroImage = firstImage?.page_primary_image
    || (firstImage
    ? relative(pageDir, join(projectRoot, firstImage.local_primary_image)).replaceAll('\\', '/')
    : '')
  const categoryButtons = categories.map((category, index) => `
        <button class="family-tab${index === 0 ? ' is-active' : ''}" data-filter="${escapeAttr(category.category_name)}" data-category-key="${escapeAttr(category.source_category_id)}">${escapeHtml(category.category_name)}</button>`).join('')
  const productCards = featured.map((product) => {
    const image = product.page_primary_image
      || (product.local_primary_image
      ? relative(pageDir, join(projectRoot, product.local_primary_image)).replaceAll('\\', '/')
      : '')
    const classification = classifyProduct(product).join(' / ')
    return `
          <article class="product-tile" data-category="${escapeAttr(product.category)}" data-category-key="${escapeAttr(product.source_category_id)}" data-product-key="${escapeAttr(product.source_product_id)}">
            ${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(product.product_code)} product image">` : '<div class="image-placeholder">Image pending</div>'}
            <div class="tile-body">
              <span data-role="product-category">${escapeHtml(product.category)}</span>
              <h3>${escapeHtml(product.product_code)}</h3>
              <p data-role="product-name">${escapeHtml(product.product_name || product.description || 'Product specification to be confirmed.')}</p>
              <dl>
                <div><dt data-i18n="grade">${defaultUi.grade}</dt><dd data-role="product-grade">${escapeHtml(product.grade || product.specs?.grade || 'To be confirmed')}</dd></div>
                <div><dt data-i18n="class">${defaultUi.class}</dt><dd data-role="product-class">${escapeHtml(classification)}</dd></div>
              </dl>
            </div>
          </article>`
  }).join('')

  const familyCards = categories.map((category) => {
    const count = products.filter((item) => item.category === category.category_name).length
    return `
        <a class="family-card" href="#products" data-family="${escapeAttr(category.category_name)}" data-category-key="${escapeAttr(category.source_category_id)}">
          <strong data-role="family-name">${escapeHtml(category.category_name)}</strong>
          <span data-role="family-count" data-count="${count}">${count} ${defaultUi.imported_products}</span>
        </a>`
  }).join('')
  const contactSocialLinks = CONTACT_PROFILE.social.map((link) => `
          <a class="contact-link" href="${escapeAttr(link.url)}" data-contact-channel="${escapeAttr(link.key)}">${escapeHtml(link.label)}</a>`).join('')
  const chatSocialLinks = CONTACT_PROFILE.social.map((link) => `
            <a class="chat-contact-link" href="${escapeAttr(link.url)}" data-contact-channel="${escapeAttr(link.key)}">${escapeHtml(link.label)}</a>`).join('')
  const advantageSlides = [
    {
      index: '01',
      kind: 'price',
      label: 'QTY',
      titleKey: 'advantage_qty_title',
      bodyKey: 'advantage_qty_body',
      rhythm: 'Batch / Destination / Packaging'
    },
    {
      index: '02',
      kind: 'label',
      label: 'LABEL',
      titleKey: 'advantage_label_title',
      bodyKey: 'advantage_label_body',
      rhythm: 'Sticker / Carton / Catalogue'
    },
    {
      index: '03',
      kind: 'model',
      label: 'MODEL',
      titleKey: 'advantage_model_title',
      bodyKey: 'advantage_model_body',
      rhythm: 'Port / Color / Wiring'
    },
    {
      index: '04',
      kind: 'custom',
      label: 'CUSTOM',
      titleKey: 'advantage_product_title',
      bodyKey: 'advantage_product_body',
      rhythm: 'Kit / Accessory / Application'
    }
  ].map((slide) => `
              <article class="advantage-slide is-${escapeAttr(slide.kind)}">
                <div class="slide-number">${escapeHtml(slide.index)}</div>
                <div class="slide-copy">
                  <span class="slide-label">${escapeHtml(slide.label)}</span>
                  <h3 data-i18n="${escapeAttr(slide.titleKey)}">${escapeHtml(defaultUi[slide.titleKey])}</h3>
                  <p data-i18n="${escapeAttr(slide.bodyKey)}">${escapeHtml(defaultUi[slide.bodyKey])}</p>
                  <small>${escapeHtml(slide.rhythm)}</small>
                </div>
              </article>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Structured Connectivity Product Draft</title>
  <style>
    :root {
      --ink: #17191f;
      --muted: #5f6673;
      --line: #d8dde6;
      --paper: #ffffff;
      --soft: #f4f6f9;
      --red: #d7193f;
      --blue: #1769aa;
      --steel: #8a94a3;
      --max: 1180px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
    }
    a { color: inherit; text-decoration: none; }
    img { display: block; max-width: 100%; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(255,255,255,.96);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px);
    }
    .nav {
      max-width: var(--max);
      margin: 0 auto;
      min-height: 72px;
      display: grid;
      grid-template-columns: 240px 1fr auto auto;
      align-items: center;
      gap: 22px;
      padding: 0 22px;
    }
    .brand strong { display: block; font-size: 18px; }
    .brand span { color: var(--muted); font-size: 12px; }
    .navlinks {
      display: flex;
      gap: 22px;
      color: var(--muted);
      font-size: 14px;
    }
    .language-control {
      display: grid;
      gap: 4px;
      min-width: 230px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .language-select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: white;
      color: var(--ink);
      padding: 0 10px;
      font-size: 13px;
      text-transform: none;
    }
    .quote-btn {
      border: 0;
      background: var(--red);
      color: white;
      min-height: 40px;
      padding: 0 18px;
      border-radius: 4px;
      font-weight: 700;
      cursor: pointer;
    }
    .hero {
      background: linear-gradient(90deg, #191d25 0%, #2d313a 58%, #f2f4f7 58%, #f2f4f7 100%);
      color: white;
    }
    .hero-inner {
      max-width: var(--max);
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 440px;
      gap: 44px;
      padding: 82px 22px 58px;
      align-items: center;
    }
    .eyebrow {
      color: #c9d3df;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0;
      font-size: 48px;
      line-height: 1.06;
      max-width: 680px;
      letter-spacing: 0;
    }
    .hero p {
      max-width: 590px;
      color: #dfe5ec;
      font-size: 17px;
      margin: 22px 0 0;
    }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
    .secondary-btn {
      min-height: 40px;
      border: 1px solid #aeb7c2;
      background: transparent;
      color: white;
      border-radius: 4px;
      padding: 0 16px;
      font-weight: 700;
      cursor: pointer;
    }
    .hero-product {
      background: white;
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 430px;
      display: grid;
      place-items: center;
      padding: 28px;
      box-shadow: 0 18px 42px rgba(0,0,0,.16);
      position: relative;
      overflow: visible;
    }
    .hero-product img {
      max-height: 275px;
      object-fit: contain;
      position: relative;
      z-index: 1;
      transform: translateY(-40px);
    }
    .hero-advantage-float {
      position: absolute;
      left: 50%;
      bottom: -54px;
      z-index: 3;
      width: min(520px, calc(100vw - 44px));
      transform: translateX(-50%);
      border: 1px solid rgba(216,221,230,.95);
      border-radius: 8px;
      background: rgba(255,255,255,.97);
      box-shadow: 0 22px 58px rgba(0,0,0,.22);
      overflow: hidden;
    }
    .advantage-float-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      align-items: start;
      padding: 15px 16px 10px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .advantage-float-head .eyebrow {
      color: var(--red);
      margin-bottom: 4px;
      font-size: 11px;
    }
    .advantage-float-head h2 {
      margin: 0;
      color: var(--ink);
      font-size: 19px;
      line-height: 1.18;
      letter-spacing: 0;
      max-width: 360px;
    }
    .advantage-controls {
      display: flex;
      justify-self: start;
      gap: 6px;
    }
    .advantage-control {
      width: 34px;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: white;
      color: var(--ink);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }
    .advantage-track {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 100%;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      scrollbar-width: none;
    }
    .advantage-track::-webkit-scrollbar { display: none; }
    .advantage-slide {
      min-height: 214px;
      scroll-snap-align: start;
      display: grid;
      grid-template-columns: 86px 1fr;
      gap: 16px;
      padding: 18px 18px 20px;
      color: var(--ink);
      position: relative;
      overflow: hidden;
    }
    .slide-number {
      font-size: 46px;
      line-height: .9;
      font-weight: 900;
      color: #d7193f;
    }
    .slide-copy {
      display: grid;
      align-content: start;
      gap: 8px;
      min-width: 0;
    }
    .slide-label {
      justify-self: start;
      min-height: 26px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 0 8px;
      color: var(--steel);
      font-size: 11px;
      font-weight: 900;
    }
    .advantage-slide h3 {
      margin: 0;
      letter-spacing: 0;
      line-height: 1.08;
      color: var(--ink);
    }
    .advantage-slide p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .advantage-slide small {
      color: var(--blue);
      font-weight: 800;
      font-size: 11px;
    }
    .advantage-slide.is-price {
      background: linear-gradient(135deg, #ffffff 0%, #fff7f7 100%);
    }
    .advantage-slide.is-price h3 { font-size: 30px; }
    .advantage-slide.is-price p { font-size: 14px; max-width: 330px; }
    .advantage-slide.is-label {
      grid-template-columns: 112px 1fr;
      background: linear-gradient(135deg, #ffffff 0%, #f5f8fb 100%);
    }
    .advantage-slide.is-label .slide-number {
      align-self: start;
      display: grid;
      place-items: center;
      width: 74px;
      height: 74px;
      border: 1px dashed var(--blue);
      border-radius: 6px;
      font-size: 28px;
      color: var(--blue);
    }
    .advantage-slide.is-label h3 { font-size: 25px; }
    .advantage-slide.is-label p { font-size: 14px; }
    .advantage-slide.is-model {
      background: #17191f;
      color: white;
    }
    .advantage-slide.is-model .slide-number,
    .advantage-slide.is-model h3 { color: white; }
    .advantage-slide.is-model .slide-label {
      border-color: rgba(255,255,255,.25);
      color: #c9d3df;
      background: rgba(255,255,255,.06);
    }
    .advantage-slide.is-model p { color: #dfe5ec; font-size: 13px; }
    .advantage-slide.is-model h3 {
      font-size: 24px;
      font-family: Arial, Helvetica, sans-serif;
    }
    .advantage-slide.is-model small { color: #8fc6ff; }
    .advantage-slide.is-custom {
      grid-template-columns: 72px 1fr;
      background: linear-gradient(135deg, #ffffff 0%, #f2f7fb 100%);
    }
    .advantage-slide.is-custom .slide-number {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--red);
      color: white;
      font-size: 20px;
    }
    .advantage-slide.is-custom h3 { font-size: 26px; }
    .advantage-slide.is-custom p { font-size: 14px; max-width: 350px; }
    .stats {
      max-width: var(--max);
      margin: 76px auto 0;
      padding: 0 22px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      position: relative;
      z-index: 2;
    }
    .stat {
      background: white;
      border: 1px solid var(--line);
      padding: 20px;
    }
    .stat b { display: block; font-size: 26px; }
    .stat span { color: var(--muted); font-size: 13px; }
    .section {
      max-width: var(--max);
      margin: 0 auto;
      padding: 64px 22px 0;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: end;
      margin-bottom: 22px;
    }
    .section-head h2 {
      margin: 0;
      font-size: 30px;
      letter-spacing: 0;
    }
    .section-head p {
      margin: 0;
      color: var(--muted);
      max-width: 520px;
    }
    .family-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    .family-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      background: var(--soft);
      min-height: 112px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .family-card strong { font-size: 16px; }
    .family-card span { color: var(--muted); font-size: 13px; }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .family-tab {
      min-height: 36px;
      border: 1px solid var(--line);
      background: white;
      border-radius: 4px;
      padding: 0 12px;
      cursor: pointer;
      color: var(--muted);
    }
    .family-tab.is-active {
      color: white;
      background: var(--ink);
      border-color: var(--ink);
    }
    .product-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .product-tile {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: white;
      overflow: hidden;
      min-height: 390px;
      display: flex;
      flex-direction: column;
    }
    .product-tile img,
    .image-placeholder {
      height: 190px;
      width: 100%;
      object-fit: contain;
      background: #f7f8fa;
      padding: 18px;
      display: grid;
      place-items: center;
      color: var(--muted);
    }
    .tile-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }
    .tile-body span {
      color: var(--red);
      font-size: 12px;
      font-weight: 700;
    }
    .tile-body h3 { margin: 0; font-size: 18px; }
    .tile-body p { margin: 0; color: var(--muted); font-size: 14px; }
    dl { margin: auto 0 0; display: grid; gap: 8px; }
    dl div {
      display: grid;
      grid-template-columns: 66px 1fr;
      gap: 8px;
      align-items: start;
      font-size: 12px;
    }
    dt { color: var(--steel); }
    dd { margin: 0; color: var(--ink); }
    .proof-band {
      margin-top: 64px;
      background: #f3f5f8;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .proof-inner {
      max-width: var(--max);
      margin: 0 auto;
      padding: 52px 22px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .proof {
      border-left: 4px solid var(--blue);
      padding-left: 16px;
    }
    .proof h3 { margin: 0 0 8px; }
    .proof p { margin: 0; color: var(--muted); }
    .rfq {
      max-width: var(--max);
      margin: 0 auto;
      padding: 60px 22px 72px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      align-items: center;
    }
    .rfq-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      display: grid;
      gap: 12px;
      background: white;
    }
    .field {
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 11px 12px;
      color: var(--muted);
      background: #fbfcfd;
    }
    .contact-section {
      max-width: var(--max);
      margin: 0 auto;
      padding: 0 22px 70px;
      display: grid;
      grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr);
      gap: 28px;
      align-items: start;
    }
    .contact-section h2 {
      margin: 6px 0 12px;
      font-size: 30px;
      letter-spacing: 0;
    }
    .contact-section p { margin: 0; color: var(--muted); }
    .contact-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      padding: 20px;
      display: grid;
      gap: 14px;
    }
    .contact-row {
      display: grid;
      grid-template-columns: 118px 1fr;
      gap: 12px;
      align-items: start;
      font-size: 14px;
    }
    .contact-row b { color: var(--steel); }
    .contact-row a {
      color: var(--blue);
      font-weight: 800;
      text-decoration: none;
    }
    .contact-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .contact-link {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 0 11px;
      background: white;
      color: var(--ink);
      font-size: 12px;
      font-weight: 800;
      text-decoration: none;
    }
    .footer {
      border-top: 1px solid var(--line);
      padding: 24px 22px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
    .chat-launcher {
      position: fixed;
      right: 22px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 49;
      min-height: 46px;
      border: 0;
      border-radius: 4px;
      padding: 0 18px;
      background: var(--red);
      color: white;
      font-weight: 800;
      box-shadow: 0 16px 34px rgba(0,0,0,.18);
      cursor: pointer;
    }
    .chat-backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      background: rgba(15, 20, 28, .42);
    }
    .chat-backdrop.is-open { display: block; }
    .chat-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 51;
      width: min(820px, calc(100vw - 40px));
      max-height: min(760px, calc(100vh - 48px));
      display: none;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: white;
      box-shadow: 0 24px 70px rgba(0,0,0,.22);
    }
    .chat-panel.is-open { display: grid; }
    .chat-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--line);
      background: #f7f8fa;
    }
    .chat-head strong { display: block; font-size: 18px; }
    .chat-head span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
    .chat-close {
      width: 34px;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: white;
      color: var(--ink);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
    }
    .chat-body {
      overflow: auto;
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(280px, .95fr) minmax(320px, 1.05fr);
      gap: 12px;
      align-items: start;
    }
    .chat-note {
      grid-column: 1 / -1;
      border-left: 4px solid var(--blue);
      background: #eef5fb;
      color: #27425c;
      padding: 10px 12px;
      font-size: 12px;
    }
    .chat-assist-column {
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .chat-ai-card {
      border: 1px solid #d8e6f2;
      border-radius: 7px;
      background: #f7fbff;
      min-height: 308px;
      padding: 18px;
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .chat-ai-card b {
      color: var(--ink);
      font-size: 18px;
    }
    .chat-ai-card p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .chat-quick {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .chat-quick button,
    .chat-handoff {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: white;
      color: var(--ink);
      font: inherit;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .chat-handoff {
      border-color: var(--blue);
      color: var(--blue);
    }
    .chat-contact-card {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fbfcfd;
      padding: 14px;
      display: grid;
      gap: 9px;
      font-size: 12px;
    }
    .chat-contact-card b { font-size: 14px; color: var(--ink); }
    .chat-contact-card span,
    .chat-contact-card p { color: var(--muted); margin: 0; }
    .chat-contact-card a {
      color: var(--blue);
      font-weight: 800;
      text-decoration: none;
    }
    .chat-contact-links {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chat-contact-link {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 0 8px;
      background: white;
      color: var(--ink);
    }
    .chat-form {
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .chat-field {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .chat-field input,
    .chat-field select,
    .chat-field textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: white;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      padding: 10px;
    }
    .chat-field textarea {
      min-height: 86px;
      resize: vertical;
    }
    .chat-actions {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }
    .chat-status {
      min-height: 20px;
      color: var(--blue);
      font-size: 12px;
      font-weight: 700;
    }
    .chat-drafts {
      grid-column: 1 / -1;
      border-top: 1px solid var(--line);
      padding-top: 12px;
      display: grid;
      gap: 10px;
    }
    .chat-drafts-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .chat-clear {
      border: 1px solid var(--line);
      background: white;
      min-height: 30px;
      border-radius: 4px;
      padding: 0 10px;
      color: var(--muted);
      cursor: pointer;
    }
    .chat-list {
      display: grid;
      gap: 8px;
      max-height: 210px;
      overflow: auto;
    }
    .chat-item {
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 10px;
      background: #fbfcfd;
      font-size: 12px;
    }
    .chat-item b { display: block; color: var(--ink); font-size: 13px; margin-bottom: 4px; }
    .chat-item p { margin: 6px 0 0; color: var(--muted); }
    .chat-empty {
      color: var(--muted);
      font-size: 12px;
      padding: 8px 0;
    }
    [dir="rtl"] .chat-launcher {
      right: auto;
      left: 22px;
    }
    [dir="rtl"] body { text-align: right; }
    [dir="rtl"] .proof {
      border-left: 0;
      border-right: 4px solid var(--blue);
      padding-left: 0;
      padding-right: 16px;
    }
    [dir="rtl"] .chat-note {
      border-left: 0;
      border-right: 4px solid var(--blue);
    }
    [dir="rtl"] dl div {
      grid-template-columns: 1fr 66px;
    }
    [dir="rtl"] dt { order: 2; }
    [dir="rtl"] dd { order: 1; }
    @media (max-width: 920px) {
      .nav { grid-template-columns: 1fr auto; gap: 12px; }
      .navlinks { display: none; }
      .language-control { grid-column: 1 / -1; min-width: 0; padding-bottom: 12px; }
      .hero { background: #191d25; }
      .hero-inner { grid-template-columns: 1fr; padding-top: 56px; }
      .hero-product {
        width: min(520px, 100%);
        justify-self: center;
        min-height: 500px;
      }
      h1 { font-size: 38px; }
      .stats { grid-template-columns: repeat(2, 1fr); margin-top: 64px; }
      .family-grid, .product-grid, .proof-inner, .rfq { grid-template-columns: 1fr 1fr; }
      .contact-section { grid-template-columns: 1fr; }
      .chat-body { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      .nav { min-height: 62px; padding: 0 16px; }
      .quote-btn { padding: 0 12px; }
      .hero-inner { padding: 38px 16px 34px; gap: 24px; }
      h1 { font-size: 30px; }
      .hero p { font-size: 15px; }
      .hero-product {
        min-height: 560px;
        padding: 16px;
        align-content: start;
      }
      .hero-product img {
        max-height: 210px;
        transform: none;
        margin-top: 10px;
      }
      .hero-advantage-float {
        width: calc(100vw - 32px);
        bottom: 20px;
      }
      .advantage-float-head {
        grid-template-columns: 1fr;
        padding: 13px 14px 9px;
      }
      .advantage-float-head h2 { font-size: 16px; max-width: none; }
      .advantage-controls { justify-self: start; }
      .advantage-slide {
        min-height: 252px;
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 16px;
      }
      .slide-number { font-size: 34px; }
      .advantage-slide.is-price h3,
      .advantage-slide.is-label h3,
      .advantage-slide.is-model h3,
      .advantage-slide.is-custom h3 {
        font-size: 23px;
      }
      .advantage-slide.is-label,
      .advantage-slide.is-custom {
        grid-template-columns: 1fr;
      }
      .stats { margin-top: 0; }
      .stats, .family-grid, .product-grid, .proof-inner, .rfq { grid-template-columns: 1fr; }
      .section { padding: 42px 16px 0; }
      .section-head { display: block; }
      .section-head p { margin-top: 10px; }
      .contact-section { padding: 42px 16px 56px; }
      .contact-row { grid-template-columns: 1fr; gap: 4px; }
      .product-tile { min-height: 0; }
      .chat-launcher {
        right: 12px;
        left: auto;
        width: auto;
        max-width: 112px;
        padding: 0 14px;
      }
      .chat-panel {
        width: calc(100vw - 24px);
        max-height: calc(100vh - 32px);
      }
      .chat-head { padding: 14px; }
      .chat-body { padding: 12px; }
      .chat-ai-card { min-height: 0; padding: 14px; }
      [dir="rtl"] .chat-launcher {
        right: auto;
        left: 12px;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <nav class="nav" aria-label="Main navigation">
      <a class="brand" href="#">
        <strong data-i18n="brand_title">${defaultUi.brand_title}</strong>
        <span data-i18n="brand_subtitle">${defaultUi.brand_subtitle}</span>
      </a>
      <div class="navlinks">
        <a href="#families" data-i18n="nav_products">${defaultUi.nav_products}</a>
        <a href="#proof" data-i18n="nav_proof">${defaultUi.nav_proof}</a>
        <a href="#advantages" data-i18n="nav_advantages">${defaultUi.nav_advantages}</a>
        <a href="#rfq" data-i18n="nav_rfq">${defaultUi.nav_rfq}</a>
        <a href="#contact" data-i18n="nav_contact">${defaultUi.nav_contact}</a>
      </div>
      <label class="language-control" for="languageSelect">
        <span data-i18n="language_label">${defaultUi.language_label}</span>
        <select class="language-select" id="languageSelect">
          ${localeOptions}
        </select>
      </label>
      <button class="quote-btn" data-i18n="request_quote">${defaultUi.request_quote}</button>
    </nav>
  </header>
  <main>
    <section class="hero">
      <div class="hero-inner">
        <div>
          <div class="eyebrow" data-i18n="eyebrow">${defaultUi.eyebrow}</div>
          <h1 data-i18n="hero_title">${defaultUi.hero_title}</h1>
          <p data-i18n="hero_body">${defaultUi.hero_body}</p>
          <div class="hero-actions">
            <button class="quote-btn" data-i18n="build_rfq_pack">${defaultUi.build_rfq_pack}</button>
            <button class="secondary-btn" data-i18n="view_product_families">${defaultUi.view_product_families}</button>
          </div>
        </div>
        <div class="hero-product">
          ${heroImage ? `<img src="${escapeAttr(heroImage)}" alt="Featured imported product">` : '<div class="image-placeholder">Featured image pending</div>'}
          <section class="hero-advantage-float" id="advantages" aria-label="Manufacturing flexibility">
            <div class="advantage-float-head">
              <div>
                <div class="eyebrow" data-i18n="advantages_label">${defaultUi.advantages_label}</div>
                <h2 data-i18n="advantages_heading">${defaultUi.advantages_heading}</h2>
              </div>
              <div class="advantage-controls" aria-label="Manufacturing flexibility controls">
                <button class="advantage-control" type="button" data-advantage-dir="-1" aria-label="Previous advantage">‹</button>
                <button class="advantage-control" type="button" data-advantage-dir="1" aria-label="Next advantage">›</button>
              </div>
            </div>
            <div class="advantage-track" id="advantageTrack">
              ${advantageSlides}
            </div>
          </section>
        </div>
      </div>
    </section>
    <div class="stats">
      <div class="stat"><b>${products.length}</b><span data-i18n="products_imported">${defaultUi.products_imported}</span></div>
      <div class="stat"><b>${categories.length}</b><span data-i18n="product_families">${defaultUi.product_families}</span></div>
      <div class="stat"><b data-i18n="draft">${defaultUi.draft}</b><span data-i18n="human_review_required">${defaultUi.human_review_required}</span></div>
      <div class="stat"><b data-i18n="no">${defaultUi.no}</b><span data-i18n="external_publish_allowed">${defaultUi.external_publish_allowed}</span></div>
    </div>
    <section class="section" id="families">
      <div class="section-head">
        <h2 data-i18n="product_families_heading">${defaultUi.product_families_heading}</h2>
        <p data-i18n="product_families_body">${defaultUi.product_families_body}</p>
      </div>
      <div class="family-grid">
        ${familyCards}
      </div>
    </section>
    <section class="section" id="products">
      <div class="section-head">
        <h2 data-i18n="imported_product_grid">${defaultUi.imported_product_grid}</h2>
        <p data-i18n="imported_product_body">${defaultUi.imported_product_body}</p>
      </div>
      <div class="tabs">
        ${categoryButtons}
      </div>
      <div class="product-grid">
        ${productCards}
      </div>
    </section>
    <section class="proof-band" id="proof">
      <div class="proof-inner">
        <div class="proof">
          <h3 data-i18n="source_traceability">${defaultUi.source_traceability}</h3>
          <p data-i18n="source_traceability_body">${defaultUi.source_traceability_body}</p>
        </div>
        <div class="proof">
          <h3 data-i18n="claim_guardrails">${defaultUi.claim_guardrails}</h3>
          <p data-i18n="claim_guardrails_body">${defaultUi.claim_guardrails_body}</p>
        </div>
        <div class="proof">
          <h3 data-i18n="reusable_ai_flow">${defaultUi.reusable_ai_flow}</h3>
          <p data-i18n="reusable_ai_flow_body">${defaultUi.reusable_ai_flow_body}</p>
        </div>
      </div>
    </section>
    <section class="rfq" id="rfq">
      <div>
        <div class="eyebrow" style="color: var(--red)" data-i18n="rfq_ready_structure">${defaultUi.rfq_ready_structure}</div>
        <h2 data-i18n="rfq_heading">${defaultUi.rfq_heading}</h2>
        <p style="color: var(--muted)" data-i18n="rfq_body">${defaultUi.rfq_body}</p>
      </div>
      <div class="rfq-panel" aria-label="RFQ field preview">
        <div class="field" data-i18n="field_product_family">${defaultUi.field_product_family}</div>
        <div class="field" data-i18n="field_target_grade">${defaultUi.field_target_grade}</div>
        <div class="field" data-i18n="field_quantity">${defaultUi.field_quantity}</div>
        <div class="field" data-i18n="field_destination">${defaultUi.field_destination}</div>
        <button class="quote-btn" data-i18n="generate_inquiry">${defaultUi.generate_inquiry}</button>
      </div>
    </section>
    <section class="contact-section" id="contact">
      <div>
        <div class="eyebrow" style="color: var(--red)" data-i18n="contact_label">${defaultUi.contact_label}</div>
        <h2 data-i18n="contact_heading">${defaultUi.contact_heading}</h2>
        <p data-i18n="contact_body">${defaultUi.contact_body}</p>
      </div>
      <div class="contact-panel">
        <div class="contact-row">
          <b data-i18n="contact_email_label">${defaultUi.contact_email_label}</b>
          <a href="mailto:${escapeAttr(CONTACT_PROFILE.email)}">${escapeHtml(CONTACT_PROFILE.email)}</a>
        </div>
        <div class="contact-row">
          <b data-i18n="contact_address_label">${defaultUi.contact_address_label}</b>
          <span>${escapeHtml(CONTACT_PROFILE.address)}</span>
        </div>
        <div class="contact-row">
          <b data-i18n="contact_social_label">${defaultUi.contact_social_label}</b>
          <div class="contact-links">
            ${contactSocialLinks}
          </div>
        </div>
        <div class="contact-row">
          <b data-i18n="contact_pending">${defaultUi.contact_pending}</b>
          <span data-i18n="footer_note">${defaultUi.footer_note}</span>
        </div>
      </div>
    </section>
  </main>
  <footer class="footer">
    <span>Draft generated ${escapeHtml(generatedAt)}. Source data: ${escapeHtml(sourceUrl)}. Layout reference: ${escapeHtml(referenceUrl)}. </span><span data-i18n="footer_note">${defaultUi.footer_note}</span>
  </footer>
  <button class="chat-launcher" type="button" id="chatLauncher" data-i18n="chat_open">${defaultUi.chat_open}</button>
  <div class="chat-backdrop" id="chatBackdrop"></div>
  <aside class="chat-panel" id="chatPanel" aria-label="Customer message board" aria-hidden="true">
    <div class="chat-head">
      <div>
        <strong data-i18n="chat_title">${defaultUi.chat_title}</strong>
        <span data-i18n="chat_subtitle">${defaultUi.chat_subtitle}</span>
      </div>
      <button class="chat-close" type="button" id="chatClose" aria-label="Close">&times;</button>
    </div>
    <div class="chat-body">
      <div class="chat-note" data-i18n="chat_draft_notice">${defaultUi.chat_draft_notice}</div>
      <div class="chat-assist-column">
        <div class="chat-ai-card">
          <b data-i18n="chat_ai_status">${defaultUi.chat_ai_status}</b>
          <p data-i18n="chat_ai_greeting">${defaultUi.chat_ai_greeting}</p>
          <p data-i18n="chat_ai_note">${defaultUi.chat_ai_note}</p>
          <div class="chat-quick" aria-label="Common inquiry prompts">
            <button type="button" data-chat-template="chat_moq_template" data-i18n="chat_moq">${defaultUi.chat_moq}</button>
            <button type="button" data-chat-template="chat_certificates_template" data-i18n="chat_certificates">${defaultUi.chat_certificates}</button>
            <button type="button" data-chat-template="chat_private_label_template" data-i18n="chat_private_label">${defaultUi.chat_private_label}</button>
            <button type="button" data-chat-template="chat_lead_time_template" data-i18n="chat_lead_time">${defaultUi.chat_lead_time}</button>
          </div>
          <button class="chat-handoff" type="button" id="chatHumanTakeover" data-i18n="chat_human_takeover">${defaultUi.chat_human_takeover}</button>
        </div>
        <div class="chat-contact-card">
          <b data-i18n="chat_contact_title">${defaultUi.chat_contact_title}</b>
          <p data-i18n="chat_contact_note">${defaultUi.chat_contact_note}</p>
          <a href="mailto:${escapeAttr(CONTACT_PROFILE.email)}">${escapeHtml(CONTACT_PROFILE.email)}</a>
          <span>${escapeHtml(CONTACT_PROFILE.address)}</span>
          <div class="chat-contact-links">
            ${chatSocialLinks}
          </div>
        </div>
      </div>
      <form class="chat-form" id="chatForm">
        <label class="chat-field">
          <span data-i18n="chat_topic">${defaultUi.chat_topic}</span>
          <select name="topic">
            <option value="sample" data-i18n="chat_topic_sample">${defaultUi.chat_topic_sample}</option>
            <option value="distributor" data-i18n="chat_topic_distributor">${defaultUi.chat_topic_distributor}</option>
            <option value="technical" data-i18n="chat_topic_technical">${defaultUi.chat_topic_technical}</option>
            <option value="oem" data-i18n="chat_topic_oem">${defaultUi.chat_topic_oem}</option>
          </select>
        </label>
        <label class="chat-field">
          <span data-i18n="chat_name">${defaultUi.chat_name}</span>
          <input name="name" autocomplete="name">
        </label>
        <label class="chat-field">
          <span data-i18n="chat_email">${defaultUi.chat_email}</span>
          <input name="email" type="email" autocomplete="email">
        </label>
        <label class="chat-field">
          <span data-i18n="chat_company">${defaultUi.chat_company}</span>
          <input name="company" autocomplete="organization">
        </label>
        <label class="chat-field">
          <span data-i18n="chat_message">${defaultUi.chat_message}</span>
          <textarea name="message"></textarea>
        </label>
        <div class="chat-actions">
          <div class="chat-status" id="chatStatus" aria-live="polite"></div>
          <button class="quote-btn" type="submit" data-i18n="chat_send">${defaultUi.chat_send}</button>
        </div>
      </form>
      <div class="chat-drafts">
        <div class="chat-drafts-head">
          <span data-i18n="chat_status">${defaultUi.chat_status}</span>
          <button class="chat-clear" type="button" id="chatClear" data-i18n="chat_clear">${defaultUi.chat_clear}</button>
        </div>
        <div class="chat-list" id="chatList"></div>
      </div>
    </div>
  </aside>
  <script id="localizedPayload" type="application/json">${localeJson}</script>
  <script>
    const payload = JSON.parse(document.getElementById('localizedPayload').textContent);
    const buttons = document.querySelectorAll('.family-tab');
    const tiles = document.querySelectorAll('.product-tile');
    const languageSelect = document.getElementById('languageSelect');
    const advantageTrack = document.getElementById('advantageTrack');
    const advantageControls = document.querySelectorAll('[data-advantage-dir]');
    let advantageIndex = 0;
    const pageParams = new URLSearchParams(window.location.search);

    function t(locale, key) {
      return (payload.ui[locale] && payload.ui[locale][key]) || payload.ui.en[key] || key;
    }

    function currentLocale() {
      return languageSelect.value || payload.default_locale;
    }

    function applyLanguage(locale) {
      const language = payload.locales[locale] ? locale : payload.default_locale;
      document.documentElement.lang = language;
      document.documentElement.dir = payload.locales[language].dir || 'ltr';
      document.querySelectorAll('[data-i18n]').forEach((node) => {
        node.textContent = t(language, node.dataset.i18n);
      });
      document.querySelectorAll('[data-category-key]').forEach((node) => {
        const labels = payload.categories[node.dataset.categoryKey];
        if (!labels) return;
        const label = labels[language] || labels.en;
        if (node.classList.contains('family-tab')) node.textContent = label;
        const familyName = node.querySelector('[data-role="family-name"]');
        if (familyName) familyName.textContent = label;
        const familyCount = node.querySelector('[data-role="family-count"]');
        if (familyCount) familyCount.textContent = familyCount.dataset.count + ' ' + t(language, 'imported_products');
      });
      tiles.forEach((tile) => {
        const localized = payload.products[tile.dataset.productKey]?.[language] || payload.products[tile.dataset.productKey]?.en;
        if (!localized) return;
        tile.querySelector('[data-role="product-category"]').textContent = localized.category;
        tile.querySelector('[data-role="product-name"]').textContent = localized.product_name;
        tile.querySelector('[data-role="product-grade"]').textContent = localized.grade;
        tile.querySelector('[data-role="product-class"]').textContent = localized.classification;
      });
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        buttons.forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        const selected = button.dataset.filter;
        tiles.forEach((tile) => {
          tile.style.display = tile.dataset.category === selected ? 'flex' : 'none';
        });
      });
    });

    advantageControls.forEach((control) => {
      control.addEventListener('click', () => {
        if (!advantageTrack) return;
        const direction = Number(control.dataset.advantageDir || 1);
        const slideWidth = advantageTrack.clientWidth;
        const slideCount = Math.max(1, advantageTrack.children.length);
        advantageIndex = (advantageIndex + direction + slideCount) % slideCount;
        advantageTrack.scrollTo({ left: advantageIndex * slideWidth, behavior: 'smooth' });
      });
    });

    languageSelect.addEventListener('change', () => {
      localStorage.setItem('crossBorderLocale', languageSelect.value);
      applyLanguage(languageSelect.value);
      renderChatDrafts();
      renderHumanTakeoverState();
    });

    const urlLocale = pageParams.get('locale');
    const savedLocale = urlLocale || localStorage.getItem('crossBorderLocale') || payload.default_locale;
    languageSelect.value = payload.locales[savedLocale] ? savedLocale : payload.default_locale;
    applyLanguage(languageSelect.value);

    const chatLauncher = document.getElementById('chatLauncher');
    const chatBackdrop = document.getElementById('chatBackdrop');
    const chatPanel = document.getElementById('chatPanel');
    const chatClose = document.getElementById('chatClose');
    const chatForm = document.getElementById('chatForm');
    const chatList = document.getElementById('chatList');
    const chatStatus = document.getElementById('chatStatus');
    const chatClear = document.getElementById('chatClear');
    const chatHumanTakeover = document.getElementById('chatHumanTakeover');
    const chatQuickButtons = document.querySelectorAll('[data-chat-template]');
    const chatDraftStorageKey = 'crossBorderChatDrafts';
    const chatHumanStorageKey = 'crossBorderHumanTakeover';

    function readChatDrafts() {
      try {
        const drafts = JSON.parse(localStorage.getItem(chatDraftStorageKey) || '[]');
        return Array.isArray(drafts) ? drafts : [];
      } catch {
        return [];
      }
    }

    function writeChatDrafts(drafts) {
      localStorage.setItem(chatDraftStorageKey, JSON.stringify(drafts.slice(-30)));
    }

    function openChat() {
      chatPanel.classList.add('is-open');
      chatBackdrop.classList.add('is-open');
      chatPanel.setAttribute('aria-hidden', 'false');
      chatLauncher.setAttribute('aria-expanded', 'true');
      renderChatDrafts();
      renderHumanTakeoverState();
    }

    function closeChat() {
      chatPanel.classList.remove('is-open');
      chatBackdrop.classList.remove('is-open');
      chatPanel.setAttribute('aria-hidden', 'true');
      chatLauncher.setAttribute('aria-expanded', 'false');
    }

    function renderChatDrafts() {
      if (!chatList) return;
      const language = currentLocale();
      const drafts = readChatDrafts();
      chatList.replaceChildren();
      if (!drafts.length) {
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = t(language, 'chat_empty');
        chatList.appendChild(empty);
        return;
      }
      drafts.slice().reverse().forEach((draft) => {
        const item = document.createElement('article');
        item.className = 'chat-item';
        const title = document.createElement('b');
        const topicKey = 'chat_topic_' + (draft.topic || 'sample');
        title.textContent = t(language, topicKey) + ' / ' + (draft.company || draft.name || 'Lead');
        const meta = document.createElement('span');
        meta.textContent = [draft.name, draft.email, draft.created_at].filter(Boolean).join(' | ');
        const message = document.createElement('p');
        message.textContent = draft.message || t(language, 'chat_empty');
        item.append(title, meta, message);
        chatList.appendChild(item);
      });
    }

    function renderHumanTakeoverState() {
      if (!chatStatus) return;
      const requested = localStorage.getItem(chatHumanStorageKey) === 'true';
      chatStatus.textContent = requested ? t(currentLocale(), 'chat_human_active') : '';
    }

    chatLauncher.addEventListener('click', openChat);
    chatClose.addEventListener('click', closeChat);
    chatBackdrop.addEventListener('click', closeChat);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && chatPanel.classList.contains('is-open')) closeChat();
    });
    chatClear.addEventListener('click', () => {
      localStorage.removeItem(chatDraftStorageKey);
      renderChatDrafts();
      renderHumanTakeoverState();
    });
    chatHumanTakeover.addEventListener('click', () => {
      localStorage.setItem(chatHumanStorageKey, 'true');
      renderHumanTakeoverState();
    });
    chatQuickButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const textarea = chatForm.elements.message;
        const template = t(currentLocale(), button.dataset.chatTemplate);
        textarea.value = textarea.value ? textarea.value + '\\n' + template : template;
        textarea.focus();
      });
    });
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(chatForm);
      const draft = {
        contract: 'chat_message_draft.v1',
        id: 'chat_' + Date.now(),
        created_at: new Date().toISOString(),
        locale: currentLocale(),
        topic: String(data.get('topic') || 'sample'),
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        company: String(data.get('company') || '').trim(),
        message: String(data.get('message') || '').trim(),
        ai_mode: 'draft_only',
        human_takeover_requested: localStorage.getItem(chatHumanStorageKey) === 'true',
        routing: ['cbx_08_lead_capture', 'cbx_09_inquiry_reception', 'cbx_10_quote_engine'],
        real_external_action_allowed: false
      };
      if (![draft.name, draft.email, draft.company, draft.message].some(Boolean)) {
        chatStatus.textContent = t(currentLocale(), 'chat_empty_warning');
        return;
      }
      writeChatDrafts([...readChatDrafts(), draft]);
      chatForm.reset();
      chatStatus.textContent = t(currentLocale(), 'chat_success');
      renderChatDrafts();
    });

    renderChatDrafts();
    renderHumanTakeoverState();
    if (pageParams.get('chat') === 'open') openChat();
    if (buttons[0]) buttons[0].click();
  </script>
</body>
</html>`
}

function buildChatWidgetPlan({ generatedAt, artifacts }) {
  return {
    contract: 'customer_chat_widget_plan.v1',
    generated_at: generatedAt,
    widget_id: 'site_customer_message_board',
    placement: {
      page: artifacts.site_draft,
      style: 'centered_floating_modal',
      launcher_position: 'right_center_follow_viewport',
      follows_viewport_vertical_center: true,
      open_url_parameter: 'chat=open'
    },
    contact_profile: {
      email: CONTACT_PROFILE.email,
      address: CONTACT_PROFILE.address,
      social_channels: CONTACT_PROFILE.social,
      human_review_required: true
    },
    commercial_advantages: [
      'quantity_based_price_movement',
      'private_label_and_brand_label_support',
      'special_model_customization',
      'custom_product_requirement_review'
    ],
    current_implementation: {
      mode: 'local_draft_only',
      external_send_allowed: false,
      browser_storage: {
        message_drafts: 'crossBorderChatDrafts',
        human_takeover: 'crossBorderHumanTakeover'
      },
      draft_contract: 'chat_message_draft.v1'
    },
    ai_driven_future_flow: {
      default_driver: 'AI',
      adapter_contract: 'site_chat_ai_agent.v1',
      inputs: [
        'active_locale',
        'current_product_or_family',
        'customer_message',
        'chat_history',
        'verified_product_master',
        'compliance_guardrails',
        'price_book_if_approved',
        'logistics_options_if_approved'
      ],
      outputs: [
        'answer_draft.v1',
        'missing_questions.v1',
        'lead_record.v1',
        'inquiry_intake.v1',
        'quote_preparation_context.v1'
      ],
      guardrails: [
        'do_not_claim certificates, MOQ, lead time, price or destination eligibility unless verified',
        'route quote requests to cbx_10_quote_engine before external reply',
        'keep public customer responses blocked until the approved execution mode is enabled'
      ]
    },
    human_takeover: {
      supported: true,
      trigger_sources: ['customer_click_human_takeover', 'operator_claim_session', 'AI_confidence_or_policy_block'],
      status_values: ['ai_draft_mode', 'human_takeover_requested', 'human_active', 'closed'],
      operator_actions: ['view_saved_draft', 'edit_ai_answer_draft', 'assign_owner', 'approve_external_reply']
    },
    system_routes: [
      'cbx_08_lead_capture',
      'cbx_09_inquiry_reception',
      'cbx_10_quote_engine',
      'cbx_14_after_sales_retention'
    ],
    human_review_required: true,
    real_external_action_allowed: false
  }
}

async function crawlCatalog({ sourceUrl, referenceUrl, limit }) {
  const baseUrl = normalizeBase(sourceUrl)
  const importRoot = join(projectRoot, 'runtime', 'product-automation', 'source-imports', 'qx-telecom')
  const assetsDir = join(importRoot, 'assets', 'products')
  const pageDir = join(projectRoot, 'runtime', 'product-automation', 'pages', 'qx-telecom-molex-layout-draft')
  const reviewDir = join(projectRoot, 'runtime', 'product-automation', 'review-packs', 'qx-telecom-molex-layout-draft')
  ensureDir(importRoot)
  ensureDir(assetsDir)
  ensureDir(pageDir)
  ensureDir(reviewDir)

  const homeHtml = await fetchText(baseUrl)
  const categories = extractCategories(homeHtml, baseUrl)
  const productMap = new Map()
  const crawlErrors = []

  for (const category of categories) {
    try {
      const firstPage = await fetchText(category.source_url)
      const pageUrls = extractPageUrls(firstPage, category, baseUrl)
      for (const [index, pageUrl] of pageUrls.entries()) {
        const html = index === 0 ? firstPage : await fetchText(pageUrl)
        for (const product of extractProductLinks(html, category, pageUrl, baseUrl)) {
          const previous = productMap.get(product.source_product_id) || {}
          productMap.set(product.source_product_id, { ...previous, ...product })
        }
        await sleep(80)
      }
    } catch (error) {
      crawlErrors.push({ category: category.category_name, source_url: category.source_url, error: error.message })
    }
  }

  const rawProducts = [...productMap.values()]
    .sort((a, b) => Number(b.source_product_id) - Number(a.source_product_id))
    .slice(0, limit === 'all' ? undefined : Number(limit))

  const products = []
  for (const product of rawProducts) {
    try {
      const detailHtml = await fetchText(product.source_url)
      const detailed = extractDetail(product, detailHtml, baseUrl)
      const withImage = await downloadPrimaryImage(detailed, assetsDir)
      products.push({
        ...withImage,
        classification_path: classifyProduct(withImage),
        human_review_required: true,
        publish_allowed: false
      })
      await sleep(100)
    } catch (error) {
      crawlErrors.push({ product_id: product.source_product_id, source_url: product.source_url, error: error.message })
      products.push({
        ...product,
        classification_path: classifyProduct(product),
        detail_fetch_error: error.message,
        human_review_required: true,
        publish_allowed: false
      })
    }
  }

  syncPageProductImages(products, pageDir)

  const generatedAt = nowIso()
  const localization = buildLocalization({ products, categories })
  const catalog = {
    contract: 'source_product_catalog_import.v1',
    source_id: 'qx_telecom_public_site',
    source_url: baseUrl,
    reference_layout_url: referenceUrl,
    generated_at: generatedAt,
    import_policy: {
      mode: 'authorized_source_product_rebuild',
      use_source_products: true,
      copy_reference_site_code_or_copy: false,
      external_publish_allowed: false,
      human_review_required: true
    },
    categories,
    product_count: products.length,
    products,
    crawl_errors: crawlErrors
  }

  const catalogPath = join(importRoot, 'source-products.json')
  const reportPath = join(importRoot, 'import-report.json')
  const pagePath = join(pageDir, 'index.html')
  const sitePackPath = join(pageDir, 'site-draft-pack.json')
  const localeManifestPath = join(pageDir, 'locale-manifest.json')
  const localizedCopyPath = join(pageDir, 'localized-product-copy.json')
  const chatWidgetPlanPath = join(pageDir, 'chat-widget-plan.json')
  const reviewPath = join(reviewDir, 'human-review-pack.md')

  writeJson(catalogPath, catalog)
  writeJson(reportPath, {
    contract: 'source_product_catalog_import_report.v1',
    result: crawlErrors.length ? 'pass_with_warnings' : 'pass',
    generated_at: generatedAt,
    source_url: baseUrl,
    reference_layout_url: referenceUrl,
    category_count: categories.length,
    product_count: products.length,
    image_downloaded_count: products.filter((item) => item.local_primary_image).length,
    locale_count: LOCALES.length,
    locales: LOCALES.map((locale) => ({
      code: locale.code,
      label: locale.label,
      trade_region: locale.trade_region,
      dir: locale.dir
    })),
    crawl_error_count: crawlErrors.length,
    crawl_errors: crawlErrors.slice(0, 20),
    human_review_required: true,
    publish_allowed: false
  })

  writeFileSync(pagePath, buildSiteDraftHtml({
    products,
    categories,
    pageDir,
    generatedAt,
    sourceUrl: baseUrl,
    referenceUrl,
    localization
  }), 'utf8')
  writeJson(localeManifestPath, {
    contract: 'site_locale_manifest.v1',
    generated_at: generatedAt,
    default_locale: localization.default_locale,
    locales: LOCALES,
    translation_policy: {
      preserve_product_codes: true,
      preserve_connector_standards: ['RJ45', 'UTP', 'FTP', 'STP', 'IDC', 'CAT3', 'CAT5E', 'CAT6', 'CAT6A', 'PDU'],
      translate_industry_terms: true,
      human_review_required: true
    }
  })
  writeJson(localizedCopyPath, localization)

  const artifacts = {
    source_catalog: projectRelative(catalogPath),
    import_report: projectRelative(reportPath),
    site_draft: projectRelative(pagePath),
    site_draft_pack: projectRelative(sitePackPath),
    locale_manifest: projectRelative(localeManifestPath),
    localized_product_copy: projectRelative(localizedCopyPath),
    chat_widget_plan: projectRelative(chatWidgetPlanPath),
    review_pack: projectRelative(reviewPath)
  }
  writeJson(chatWidgetPlanPath, buildChatWidgetPlan({ generatedAt, artifacts }))

  writeJson(sitePackPath, {
    contract: 'molex_style_site_draft.v1',
    generated_at: generatedAt,
    source_catalog: artifacts.source_catalog,
    reference_layout_url: referenceUrl,
    page_strategy: {
      reference_used_for: ['navigation density', 'solution-led hero', 'product family blocks', 'RFQ conversion structure'],
      not_copied: ['Molex brand', 'Molex copy', 'Molex customer cases', 'Molex proprietary code', 'Molex imagery'],
      draft_page: artifacts.site_draft
    },
    localization: {
      default_locale: localization.default_locale,
      locale_count: LOCALES.length,
      locales: LOCALES.map((locale) => locale.code),
      locale_manifest: artifacts.locale_manifest,
      localized_product_copy: artifacts.localized_product_copy,
      product_specific_translation: true,
      human_review_required: true
    },
    customer_chat_widget: {
      plan: artifacts.chat_widget_plan,
      current_mode: 'local_draft_only',
      future_ai_adapter: 'site_chat_ai_agent.v1',
      human_takeover_supported: true,
      draft_contract: 'chat_message_draft.v1',
      system_routes: [
        'cbx_08_lead_capture',
        'cbx_09_inquiry_reception',
        'cbx_10_quote_engine'
      ],
      real_external_action_allowed: false
    },
    contact_profile: {
      email: CONTACT_PROFILE.email,
      address: CONTACT_PROFILE.address,
      social_channels: CONTACT_PROFILE.social,
      human_review_required: true
    },
    commercial_advantages: {
      presentation: 'hero_image_floating_horizontal_carousel',
      quantity_based_price_movement: true,
      private_label_and_brand_label_support: true,
      special_model_customization: true,
      custom_product_requirement_review: true,
      human_review_required: true
    },
    downstream_routes: [
      'cbx_04_independent_site',
      'cbx_05_content_assets',
      'cbx_06_catalog_pricing',
      'cbx_08_lead_capture',
      'cbx_09_inquiry_reception',
      'cbx_10_quote_engine'
    ],
    human_review_required: true,
    publish_allowed: false,
    real_external_action_allowed: false
  })

  writeFileSync(reviewPath, [
    '# QX Telecom Source Import Review Pack',
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## What This Run Did',
    '',
    `- Imported product categories and products from ${baseUrl}.`,
    `- Downloaded available product images into ${projectRelative(assetsDir)}.`,
    `- Built a local draft page using ${referenceUrl} as layout reference only.`,
    '- Did not copy Molex brand, copy, customer cases, proprietary code or imagery.',
    '- Did not publish, send customer messages, create quotes or run ads.',
    '',
    '## Artifacts',
    '',
    `- Source catalog: ${artifacts.source_catalog}`,
    `- Import report: ${artifacts.import_report}`,
    `- Draft page: ${artifacts.site_draft}`,
    `- Site draft pack: ${artifacts.site_draft_pack}`,
    `- Locale manifest: ${artifacts.locale_manifest}`,
    `- Localized product copy: ${artifacts.localized_product_copy}`,
    `- Chat widget plan: ${artifacts.chat_widget_plan}`,
    '',
    '## Human Confirmation Needed',
    '',
    '- Confirm that the QX source site product data and images are authorized for private-label reuse.',
    '- Confirm localized terminology for priority markets before public publishing.',
    '- Confirm the site chat widget policy, AI answer boundaries and human takeover SLA before external use.',
    '- Confirm real email, address, Facebook, LinkedIn, WeChat, X/Twitter and WhatsApp contact details.',
    '- Confirm quantity-based pricing rules, private-label scope, special model customization scope and custom product review process.',
    '- Confirm the future brand name, logo, color system and SKU naming policy.',
    '- Confirm which certificates, standards, MOQ, lead time and packaging claims can be shown publicly.',
    '- Confirm whether all imported product families should be published or only selected launch categories.'
  ].join('\n'), 'utf8')

  const stage = loadStages().find((item) => item.node_id === 'cbx_05_content_assets')
  if (stage) {
    const surface = readStageSurface(stage.node_id) || {}
    const refs = Object.values(artifacts)
    writeStageSurface(stage, {
      ...surface,
      state: {
        ...(surface.state || {}),
        status: 'source_catalog_import_ready',
        execution_mode: 'source_site_import_local_draft',
        progress: 0.66,
        blockers: [
          'pending user review: confirm source product reuse authorization',
          'pending user review: approve private-label brand policy',
          'pending user review: approve publish'
        ],
        next_actions: ['review_imported_catalog', 'select_launch_product_families', 'run_product_page_ai_build', 'connect_site_chat_ai_adapter'],
        updated_at: generatedAt
      },
      view: {
        ...(surface.view || {}),
        runtime_refs: [...new Set([...(surface.view?.runtime_refs || []), ...refs])]
      },
      artifacts: {
        ...(surface.artifacts || {}),
        latest_report: artifacts.import_report,
        source_product_catalog: artifacts.source_catalog,
        molex_style_site_draft: artifacts.site_draft_pack,
        customer_chat_widget_plan: artifacts.chat_widget_plan
      }
    })
    writeStageEvent(stage, 'source_website_product_import', 'completed', refs, {
      source_url: baseUrl,
      reference_layout_url: referenceUrl,
      product_count: products.length,
      category_count: categories.length,
      crawl_error_count: crawlErrors.length
    })
    writeJson(join(controlPlaneRoot, 'status', 'current-status.json'), summarizeControlPlane())
  }

  return {
    contract: 'source_product_catalog_import_result.v1',
    result: crawlErrors.length ? 'pass_with_warnings' : 'pass',
    source_url: baseUrl,
    reference_layout_url: referenceUrl,
    category_count: categories.length,
    product_count: products.length,
    crawl_error_count: crawlErrors.length,
    artifacts
  }
}

const args = parseArgs(process.argv.slice(2))
const sourceUrl = normalizeBase(String(args.source || DEFAULT_SOURCE))
const referenceUrl = String(args.reference || DEFAULT_REFERENCE)
const limit = args.limit || 'all'

if (limit !== 'all' && (!Number.isInteger(Number(limit)) || Number(limit) <= 0)) {
  console.error(JSON.stringify({
    contract: 'source_product_catalog_import_result.v1',
    result: 'fail',
    error: '--limit must be "all" or a positive integer'
  }, null, 2))
  process.exit(1)
}

try {
  const result = await crawlCatalog({ sourceUrl, referenceUrl, limit })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    contract: 'source_product_catalog_import_result.v1',
    result: 'fail',
    source_url: sourceUrl,
    reference_layout_url: referenceUrl,
    error: error.message
  }, null, 2))
  process.exit(1)
}
