import type {
  CzsEvent,
  Material,
} from "@/features/digests/digest.types";

export const demoMaterials: Material[] = [
  {
    id: "mat_01",
    storyId: "story_stm_2025",
    title: "Федеральные сети ускорили запуск собственных марок",
    summary:
      "Девять ведущих ритейлеров вывели 418 новых СТМ по итогам 2025 года — на 11,2% больше, чем годом ранее.",
    impact:
      "Контрактным производителям стоит готовить отдельную экономику под СТМ: мощности, минимальную партию, срок запуска и контроль качества.",
    businessImpact:
      "Выручка от СТМ выросла до 848,3 млрд ₽ у X5, 238 млрд ₽ у «Магнита» и 80,5 млрд ₽ у «Ленты».",
    keyMetrics: [
      {
        value: "+11,2%",
        label: "новых СТМ",
        context: "418 марок у девяти федеральных ритейлеров за 2025 год",
      },
      {
        value: "848,3 млрд ₽",
        label: "выручка X5 от СТМ",
        context: "рост на 28% год к году",
      },
    ],
    articlePath: "/blog/rost-stm-federalnyh-setey",
    sourceNames: ["Retail.ru", "NTech"],
    sourceUrls: [
      "https://www.retail.ru/news/krupneyshie-riteylery-uvelichili-chislo-sobstvennykh-marok-na-11-4-maya-2026-277386/",
    ],
    sourcePublishedAt: "2026-05-04T07:10:00+03:00",
    tags: ["СТМ", "Ритейл"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-23T13:10:00+03:00",
    importance: 95,
  },
  {
    id: "mat_02",
    storyId: "story_curd_production_2026",
    title: "Производство творога стало драйвером молочного рынка",
    summary:
      "В январе–апреле выпуск творога в России достиг 182 тыс. тонн и вырос на 10,7% год к году; производство сыров прибавило 3,7%.",
    impact:
      "Рост предложения усиливает конкуренцию за полку. Поставщику нужен расчёт оборачиваемости, регионального спроса и промобюджета.",
    businessImpact:
      "Категория с растущим выпуском требует точнее считать скидку, логистику и стоимость входа в региональную матрицу.",
    keyMetrics: [
      {
        value: "182 тыс. т",
        label: "выпуск творога",
        context: "+10,7% за январь–апрель 2026 года",
      },
      {
        value: "285 тыс. т",
        label: "выпуск сыров",
        context: "+3,7% год к году",
      },
    ],
    articlePath: "/blog/tvorog-drayver-molochnogo-rynka",
    sourceNames: ["Sfera.fm", "Росстат"],
    sourceUrls: [
      "https://sfera.fm/news/molochnaya/segment-tvoroga-stal-odnim-iz-draiverov-molochnogo-rynka-rf",
    ],
    sourcePublishedAt: "2026-05-28T13:24:00+03:00",
    tags: ["Молочная продукция", "Ритейл"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-23T11:30:00+03:00",
    importance: 91,
  },
  {
    id: "mat_03",
    storyId: "story_ice_cream_decline_2026",
    title: "Выпуск мороженого снизился на фоне роста издержек",
    summary:
      "Производство мороженого в первом полугодии 2026 года сократилось на 8–9%, хотя компании продолжают инвестировать в новые вкусы и упаковку.",
    impact:
      "Производителям важно отделить прибыльные SKU от ассортиментной добивки и пересчитать сезонный запас до следующих переговоров с сетью.",
    businessImpact:
      "При падающем объёме новый SKU должен проходить порог маржинальности с учётом холода, промо и списаний.",
    keyMetrics: [
      {
        value: "−8–9%",
        label: "производство мороженого",
        context: "первое полугодие 2026 года, год к году",
      },
    ],
    articlePath: "/blog/morozhenoe-snizhenie-proizvodstva",
    sourceNames: ["Sfera.fm", "INFOLine"],
    sourceUrls: [
      "https://sfera.fm/news/molochnaya/eksperty-obyasnili-prichiny-snizheniya-proizvodstva-morozhenogo",
    ],
    sourcePublishedAt: "2026-07-17T10:00:00+03:00",
    tags: ["Молочная продукция", "Логистика"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-22T16:40:00+03:00",
    importance: 88,
  },
  {
    id: "mat_04",
    storyId: "story_ready_food_x5_2026",
    title: "Готовая еда появилась в каждом двадцатом чеке X5",
    summary:
      "Во втором квартале число чеков с готовой едой выросло более чем на 15% год к году; продажи готовых завтраков прибавили 37%.",
    impact:
      "Поставщикам готовых блюд нужен ассортимент под конкретный повод потребления и доказуемая система пищевой безопасности.",
    businessImpact:
      "Быстрорастущая подкатегория даёт шанс на тест, но стоимость контроля качества и короткой логистики должна быть заложена в цену.",
    keyMetrics: [
      {
        value: "+15%",
        label: "чеки с готовой едой",
        context: "второй квартал 2026 года, год к году",
      },
      {
        value: "+37%",
        label: "продажи готовых завтраков",
        context: "год к году",
      },
    ],
    articlePath: "/blog/gotovaya-eda-x5-v-kazhdom-dvadcatom-cheke",
    sourceNames: ["New Retail", "X5", "Роскачество"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/x5_gotovaya_eda_est_v_kazhdom_dvadtsatom_cheke/",
    ],
    sourcePublishedAt: "2026-07-22T18:40:00+03:00",
    tags: ["Ритейл", "СТМ", "Молочная продукция"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-23T10:20:00+03:00",
    importance: 84,
  },
  {
    id: "mat_05",
    storyId: "story_hot_drinks_2026",
    title: "Продажи горячих напитков в федеральных сетях выросли на 86%",
    summary:
      "Федеральные сети зафиксировали рост продаж горячих напитков на 86%; спрос усилился на форматы потребления вне дома.",
    impact:
      "Поставщикам стоит разделить предложение для полки и готового потребления, указав оборудование, расходники и доход с точки.",
    businessImpact:
      "В переговорах важна не только закупочная цена, а валовая прибыль на одну торговую точку и срок окупаемости оборудования.",
    keyMetrics: [
      {
        value: "+86%",
        label: "продажи горячих напитков",
        context: "в федеральных торговых сетях",
      },
    ],
    articlePath: "/blog/goryachie-napitki-rost-v-setyah",
    sourceNames: ["New Retail"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/prodazhi_goryachikh_napitkov_v_federalnykh_setyakh_vyrosli_na_86/",
    ],
    sourcePublishedAt: "2026-07-16T15:20:00+03:00",
    tags: ["Напитки", "Ритейл", "СТМ"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-21T17:00:00+03:00",
    importance: 81,
  },
  {
    id: "mat_06",
    storyId: "story_freight_cost_2026",
    title: "Стоимость грузоперевозок выросла почти на треть",
    summary:
      "Рыночная стоимость грузоперевозок увеличилась почти на треть, усилив давление на поставщиков с широкой региональной географией.",
    impact:
      "В КП нужно отдельно показывать логистическую составляющую, минимальную партию и границы бесплатной доставки.",
    businessImpact:
      "Новые тарифы стоит заранее учесть в географии поставок и графике отгрузок: оптимизация маршрутов поможет сохранить устойчивые условия контракта.",
    keyMetrics: [
      {
        value: "≈ +30%",
        label: "стоимость грузоперевозок",
        context: "динамика рынка в 2026 году",
      },
    ],
    articlePath: "/blog/gruzoperevozki-vyrosli-na-tret",
    sourceNames: ["New Retail"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/stoimost_gruzoperevozok_vyrosla_pochti_na_tret/",
    ],
    sourcePublishedAt: "2026-07-15T15:45:00+03:00",
    tags: ["Логистика", "Ритейл"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-21T10:00:00+03:00",
    importance: 78,
  },
  {
    id: "mat_07",
    storyId: "story_ecommerce_2025",
    title: "Интернет-продажи достигли 11,5 трлн рублей",
    summary:
      "Объём интернет-продаж в России по итогам 2025 года достиг рекордных 11,5 трлн рублей.",
    impact:
      "Поставщикам нужно считать экономику каналов отдельно: комиссия, фулфилмент, возвраты и продвижение не равны условиям классической сети.",
    businessImpact:
      "Рост рынка не гарантирует прибыль продавца: ключевой показатель — маржа после комиссии площадки, логистики и рекламы.",
    keyMetrics: [
      {
        value: "11,5 трлн ₽",
        label: "объём интернет-продаж",
        context: "Россия, 2025 год",
      },
    ],
    articlePath: "/blog/internet-prodazhi-11-5-trilliona",
    sourceNames: ["New Retail", "АКИТ"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/obyem_internet_prodazh_v_2025_godu_dostig_rekordnykh_11_5_trln_rubley/",
    ],
    sourcePublishedAt: "2026-07-16T12:25:00+03:00",
    tags: ["Маркетплейсы", "Логистика"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-20T14:15:00+03:00",
    importance: 75,
  },
  {
    id: "mat_08",
    storyId: "story_magnit_video_2026",
    title: "«Магнит» масштабировал видеоаналитику на 430 магазинов",
    summary:
      "Система контроля выкладки, наличия и очередей заработала в 430 супермаркетах и суперсторах сети.",
    impact:
      "Для поставщика это означает более быстрый контроль OOS и выкладки: расхождения между договорённостью и полкой становятся видимыми.",
    businessImpact:
      "Снижение потерь и OOS влияет на товарооборот; поставщику выгодно согласовать измеримые показатели наличия до запуска.",
    keyMetrics: [
      {
        value: "430",
        label: "магазинов с видеоаналитикой",
        context: "большие форматы «Магнита»",
      },
    ],
    articlePath: "/blog/magnit-videoanalitika-430-magazinov",
    sourceNames: ["New Retail", "Магнит"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/magnit_vnedril_sistemu_videoanalitiki_v_430_magazinakh_bolshikh_formatov/",
    ],
    sourcePublishedAt: "2026-07-22T13:40:00+03:00",
    tags: ["Ритейл", "Логистика", "Non-food"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-23T09:20:00+03:00",
    importance: 72,
  },
  {
    id: "mat_09",
    storyId: "story_average_check_2026",
    title: "Онлайн-чек вырос, а офлайн-чек снизился",
    summary:
      "Средний онлайн-чек вырос на 8,3% от базы 1 611 ₽, тогда как офлайн-чек снизился на 8,5% от базы 814 ₽.",
    impact:
      "Ассортимент и промомеханика должны учитывать разные миссии покупки: крупную корзину онлайн и частые небольшие визиты в магазин.",
    businessImpact:
      "При одинаковой марже больший онлайн-чек даёт больше рублей валовой прибыли на заказ, но требует учёта сборки и последней мили.",
    keyMetrics: [
      {
        value: "+8,3%",
        label: "средний онлайн-чек",
        context: "база 1 611 ₽, первое полугодие 2026 года",
      },
      {
        value: "−8,5%",
        label: "средний офлайн-чек",
        context: "база 814 ₽",
      },
    ],
    articlePath: "/blog/online-offline-sredniy-chek",
    sourceNames: ["New Retail", "Русский Стандарт"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/sredniy_chek_v_magazinakh_snizilsya_dannye_russkogo_standarta/",
    ],
    sourcePublishedAt: "2026-07-17T12:00:00+03:00",
    tags: ["Ритейл", "Логистика"],
    scope: "general",
    status: "approved",
    approvedAt: "2026-07-23T09:00:00+03:00",
    importance: 90,
  },
  {
    id: "mat_10",
    storyId: "story_vegetable_prices_2026",
    title: "Помидоры и огурцы подешевели на 3% за неделю",
    summary:
      "Недельное снижение цен на помидоры и огурцы составило около 3%, показав высокую волатильность свежей категории.",
    impact:
      "Закупщикам и поставщикам fresh-категории важно чаще пересматривать закупочную цену, остаток и глубину промо.",
    businessImpact:
      "Даже недельное изменение на 3% влияет на маржу категории, если розничная цена и закупочная стоимость меняются с разной скоростью.",
    keyMetrics: [
      {
        value: "≈ −3%",
        label: "цены на овощи",
        context: "помидоры и огурцы за одну неделю",
      },
    ],
    articlePath: "/blog/ovoshi-podesheveli-na-tri-procenta",
    sourceNames: ["New Retail", "Росстат"],
    sourceUrls: [
      "https://new-retail.ru/novosti/retail/pomidory_i_ogurtsy_podesheveli_na_3_za_nedelyu/",
    ],
    sourcePublishedAt: "2026-07-22T19:30:00+03:00",
    tags: ["Ритейл", "Овощи и фрукты"],
    scope: "general",
    status: "approved",
    approvedAt: "2026-07-23T10:40:00+03:00",
    importance: 80,
  },
  {
    id: "mat_11",
    storyId: "story_mvideo_fmcg_2026",
    title: "«М.Видео» открыл маркетплейс для FMCG-поставщиков",
    summary:
      "Маркетплейс добавил продукты питания и FMCG; для партнёров заявлены комиссия 15,5% и эквайринг 1,5%.",
    impact:
      "Поставщику стоит сравнить итоговую стоимость нового канала с классическими площадками и проверить требования к хранению.",
    businessImpact:
      "Базовая нагрузка до логистики и рекламы составляет 17% оборота: 15,5% комиссии плюс 1,5% эквайринга.",
    keyMetrics: [
      {
        value: "17%",
        label: "комиссия и эквайринг",
        context: "15,5% + 1,5% без дополнительных расходов",
      },
    ],
    articlePath: "/blog/mvideo-fmcg-marketplace",
    sourceNames: ["М.Видео"],
    sourceUrls: [
      "https://www.mvideoeldorado.ru/ru/press-centr/press-relizy/detail?cHash=fb9739e644e1548d8782c45dd4ffea76&tx_news_pi1%5Bnews%5D=4208",
    ],
    sourcePublishedAt: "2026-05-20T10:00:00+03:00",
    tags: ["Маркетплейсы", "Non-food", "Ритейл"],
    scope: "tagged",
    status: "approved",
    approvedAt: "2026-07-21T09:20:00+03:00",
    importance: 68,
  },
  {
    id: "mat_12",
    storyId: "story_draft",
    title: "Черновик, который не должен попасть в выпуск",
    summary: "Материал ещё не прошёл редакторскую проверку.",
    impact: "До утверждения он не используется для персонализации.",
    businessImpact: "Значение для бизнеса ещё не подтверждено редактором.",
    keyMetrics: [],
    articlePath: "/blog/draft",
    sourceNames: ["Тестовый источник"],
    sourceUrls: [],
    sourcePublishedAt: "2026-07-24T09:00:00+03:00",
    tags: ["Молочная продукция"],
    scope: "tagged",
    status: "review",
    importance: 100,
  },
];

export const demoEvents: CzsEvent[] = [
  {
    id: "event_flowers_2026",
    name: "ЦветыЭкспо 2026",
    format: "ЦЗС",
    startsAt: "2026-09-08",
    endsAt: "2026-09-08",
    location: "Москва, Крокус Экспо",
    tags: ["Non-food"],
    roles: ["buyer", "both"],
    supplierUrl: "https://platforma-czs.ru/flowexpo",
    buyerUrl: "https://platforma-czs.ru/flowexpo",
    status: "upcoming",
  },
  {
    id: "event_worldfood_2026",
    name: "WorldFood Moscow 2026",
    format: "ЦЗС",
    startsAt: "2026-09-15",
    endsAt: "2026-09-16",
    location: "Москва, Крокус Экспо",
    tags: [
      "Молочная продукция",
      "Мясо и птица",
      "Бакалея",
      "Напитки",
      "Кондитерские изделия",
      "Овощи и фрукты",
      "СТМ",
    ],
    roles: ["supplier", "buyer", "both"],
    supplierUrl: "https://platforma-czs.ru/",
    buyerUrl: "https://platforma-czs.ru/",
    status: "upcoming",
  },
  {
    id: "event_peterfood_2026",
    name: "Петерфуд 2026",
    format: "ЦЗС",
    startsAt: "2026-11-24",
    endsAt: "2026-11-25",
    location: "Санкт-Петербург, Экспофорум",
    tags: [
      "Молочная продукция",
      "Мясо и птица",
      "Бакалея",
      "Напитки",
      "Кондитерские изделия",
      "СТМ",
    ],
    roles: ["supplier", "buyer", "both"],
    supplierUrl: "https://peterfood.ru/czs",
    buyerUrl: "https://peterfood.ru/czs",
    status: "upcoming",
  },
];
