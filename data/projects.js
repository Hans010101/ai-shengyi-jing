// AI生意经 - 精选全球 AI 与数字小生意数据库
// 数据来源：全球 AI 与数字小生意大盘 | AI生意经团队独家拆解
// 最后更新：2026-07-21

const PROJECTS = [
  {
    "id": "excel-formula-bot",
    "name": "Excel公式生成机器人",
    "nameEn": "Excel Formula Generator Bot",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "No-code",
      "独立开发",
      "工具类"
    ],
    "revenue": 20000,
    "revenueDisplay": "$20K/月",
    "startupCost": 196,
    "startupDays": 30,
    "replicabilityScore": 9,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "SaaS订阅",
    "marketingChannels": [
      "SEO",
      "Reddit",
      "Product Hunt"
    ],
    "techStack": [
      "GPT API",
      "Next.js",
      "Stripe"
    ],
    "heroEmoji": "📊",
    "heroColor": "#10B981",
    "summary": "只需描述你想做什么，AI自动帮你生成Excel公式，月收入$20K的AI工具小生意。",
    "insight": "这个项目抓住了一个精准的痛点：全球数以亿计的Excel用户都在为复杂公式头疼。创始人用不到$200的成本搭建了一个简单的GPT API封装，配合清晰的SEO策略，在30天内上线并实现盈利。核心优势：需求真实 + 市场巨大 + 技术门槛极低。",
    "chinaOpportunity": "国内WPS用户超过5亿，同类需求极强。可以做「WPS/Excel公式AI助手」微信小程序，通过抖音/B站教程视频获客，配合月卡订阅模式。本土竞争者少，先发优势明显。",
    "productArch": "用户界面 (Next.js/Tailwind) ➔ 核心控制器 (API Route) ➔ OpenAI/国内大模型 API (负责公式翻译与校验) ➔ 支付网关 (Stripe/微信支付)。极其轻量，无需复杂后台数据库，只需存储用户订阅状态。",
    "businessLoop": "【获取流量】：制作'10秒生成复杂公式'短视频发布在抖音/B站，引导搜索 ➔ 【产品体验】：提供免费5次体验，降低门槛 ➔ 【转化变现】：提示次数超限，引导购买￥19/月会员 ➔ 【留存】：提供常用公式库收藏功能，提升粘性。",
    "getStartedPath": [
      "第一步：使用 Next.js 或 Python/Flask 快速搭建一个极简的一页式输入输出表单。",
      "第二步：接入大模型 API，调试 System Prompt，使其能稳定、准确地将自然语言转换为 Excel 公式，并附带解释说明。",
      "第三步：在抖音、小红书和 B 站搜索 'Excel教程'，通过录屏演示如何用你的工具 3 秒搞定复杂嵌套公式，在个人主页挂载工具链接引流。"
    ],
    "keyMetrics": {
      "mrr": "$20,000",
      "startupCost": "$196",
      "timeToFirstRevenue": "30天",
      "teamSize": "1人"
    },
    "featured": true
  },
  {
    "id": "pdf-bank-converter",
    "name": "PDF银行流水转换器",
    "nameEn": "PDF Bank Statement Converter",
    "category": [
      "效率工具",
      "Micro-SaaS"
    ],
    "tags": [
      "No-code",
      "B2B",
      "数据处理"
    ],
    "revenue": 40000,
    "revenueDisplay": "$40K/月",
    "startupCost": 100,
    "startupDays": 14,
    "replicabilityScore": 8,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "按次付费 + SaaS订阅",
    "marketingChannels": [
      "Google Ads",
      "SEO",
      "会计师社群"
    ],
    "techStack": [
      "Python",
      "PDF解析库",
      "Stripe"
    ],
    "heroEmoji": "🏦",
    "heroColor": "#3B82F6",
    "summary": "帮财务/会计人员把PDF银行流水自动转换成Excel，14天上线月赚$40K。",
    "insight": "这是一个「闷声发大财」的典型案例。创始人发现会计师和财务人员每天都要手动录入PDF里的流水数据，极其痛苦。关键洞察：服务专业用户，他们付费意愿强，且不怎么爱在网上抱怨，所以竞争少。",
    "chinaOpportunity": "国内有数百万会计从业者面临同样的痛点。可以做「银行流水智能整理」服务，支持中国各大银行格式，通过企业微信、财税圈子获客。",
    "productArch": "前端上传页面 (React) ➔ 后端解析服务 (Python + pdfplumber/PaddleOCR) ➔ 智能表结构映射模块 (规则引擎) ➔ 导出 Excel ➔ 支付系统。采用异步队列处理大型 PDF，避免连接超时。",
    "businessLoop": "【定位痛点】：瞄准高频的'每月报税季前，需要整理几十页银行 PDF 流水'痛点 ➔ 【精准引流】：在百度/谷歌购买'PDF转Excel'、'流水打印'长尾词广告 ➔ 【付费锁死】：免费转换前3页，后续按页付费（如￥1/页）或季度订阅 ➔ 【留存扩展】：支持记住常用模版，推荐给同行获得免费额度。",
    "getStartedPath": [
      "第一步：使用 Python 编写脚本，专门针对工行、建行、招行等主流银行导出的 PDF 流水进行智能表格提取与整理调试。",
      "第二步：使用 React 快速画出上传、历史列表和下载按钮，后端通过 Celery 队列处理上传的大文件。",
      "第三步：去财务交流群、会计资格考试论坛发帖分享工具，或者在小红书发布'会计如何3秒整理50页流水'教程，直接获取种子客户。"
    ],
    "keyMetrics": {
      "mrr": "$40,000",
      "startupCost": "$100",
      "timeToFirstRevenue": "14天",
      "teamSize": "1人"
    },
    "featured": true
  },
  {
    "id": "linkedin-automation",
    "name": "LinkedIn智能拓客工具",
    "nameEn": "LinkedIn Outreach Automation",
    "category": [
      "B2B SaaS",
      "营销工具"
    ],
    "tags": [
      "自动化",
      "销售",
      "外贸"
    ],
    "revenue": 60000,
    "revenueDisplay": "$60K/月",
    "startupCost": 100,
    "startupDays": 120,
    "replicabilityScore": 6,
    "difficulty": "中",
    "teamSize": 3,
    "businessModel": "SaaS订阅（$49-$199/月）",
    "marketingChannels": [
      "冷邮件",
      "LinkedIn自身",
      "内容营销"
    ],
    "techStack": [
      "Node.js",
      "Chrome Extension",
      "PostgreSQL"
    ],
    "heroEmoji": "🤝",
    "heroColor": "#0EA5E9",
    "summary": "自动化LinkedIn触达、跟进，帮B2B销售团队每月节省数百小时，月收入$60K。",
    "insight": "LinkedIn自动化是一个「规模足够大、但平台本身不想做」的市场。创始人找到了缝隙，构建浏览器插件 + 云端调度，用明确的ROI证明（帮客户多签几单就回本）快速口碑传播。",
    "chinaOpportunity": "中国外贸企业正是LinkedIn核心用户群。可以做专门针对外贸销售的「LinkedIn AI助手」，加上中文界面、以及对接国内CRM系统功能。",
    "productArch": "Chrome插件前端 (注入网页/DOM操作) ➔ 后端控制中心 (Node.js) ➔ 云端任务调度队列 (RabbitMQ + Puppeteer 模拟日常行为) ➔ 统计看板。核心在于模拟人手的频率和点击逻辑，避免触碰平台封禁风控机制。",
    "businessLoop": "【价值锚定】：帮助外贸销售批量获取询盘，ROI 计算极度明确 ➔ 【拓客增长】：利用工具本身自动化触达 LinkedIn 上的目标外贸大咖 ➔ 【转化裂变】：提供 7 天免费试用，试用期发送批量跟进开发信展示效果，直接转化高价周/月订阅 ➔ 【锁定生态】：积累客户联系方式并与企业 CRM 系统深度绑定，极难流失。",
    "getStartedPath": [
      "第一步：开发一个 Chrome 插件，实现基础的自动点击'添加好友'、自动填充预设问候语功能。",
      "第二步：设计一套风控安全机制，限制每日操作额度，模拟人类随机停顿，确保用户账号安全。",
      "第三步：制作外贸开发信模版、LinkedIn 拓客引流的干货文章，在福步论坛、外贸大咖公众号和跨境电商社群内做精准推广。"
    ],
    "keyMetrics": {
      "mrr": "$60,000",
      "startupCost": "$100",
      "timeToFirstRevenue": "120天",
      "teamSize": "3人"
    },
    "featured": true
  },
  {
    "id": "ai-document-extraction",
    "name": "AI文档数据提取平台",
    "nameEn": "AI Document Data Extraction",
    "category": [
      "AI工具",
      "企业服务"
    ],
    "tags": [
      "AI",
      "OCR",
      "自动化",
      "B2B"
    ],
    "revenue": 40000,
    "revenueDisplay": "$40K/月",
    "startupCost": 1000,
    "startupDays": 365,
    "replicabilityScore": 7,
    "difficulty": "中高",
    "teamSize": 2,
    "businessModel": "按量付费 + 企业版订阅",
    "marketingChannels": [
      "冷邮件",
      "内容营销",
      "行业展会"
    ],
    "techStack": [
      "OpenAI Vision",
      "Python",
      "AWS",
      "Stripe"
    ],
    "heroEmoji": "📄",
    "heroColor": "#8B5CF6",
    "summary": "用AI从发票、合同、报告中自动提取结构化数据，企业客户月付$40K的AI基础设施。",
    "insight": "文档处理是企业数字化的哑铃。传统OCR只能识别文字，AI文档提取能理解语义，精准提取字段。企业一旦接入几乎不会换掉（高粘性），且每个企业都有大量文档处理需求。",
    "chinaOpportunity": "国内企业数字化需求爆炸，发票、合同、报关单等场景极多。结合国内大模型（如Kimi、通义）做「企业文档AI助手」，对接用友/金蝶等ERP系统。",
    "productArch": "文档上传与解析模块 (OCR + PDF-to-Image) ➔ 大模型视觉/语义处理器 (GPT-4o Vision 或 Claude 3.5 Sonnet) ➔ 结构化 Schema 验证模块 ➔ Webhook 及 API 转发 ➔ 客户 ERP 系统整合。",
    "businessLoop": "【高客单定位】：瞄准货代公司、跨国供应链等有大量复杂非标单据需要人工核对的企业 ➔ 【直销获客】：通过冷开开发信和行业解决方案发布，直达企业 CIO/技术负责人 ➔ 【量化付费】：按单据量计费（例如￥0.1/张），绑定企业预充值 ➔ 【高墙留存】：提供自定义校验规则库，将数据流程完全融合进客户的日常业务流中。",
    "getStartedPath": [
      "第一步：利用 OpenAI Vision/国产视觉模型 API 编写原型，通过定义 JSON Schema 实现特定类型非标合同的结构化字段稳定提取。",
      "第二步：搭建带 API Key 管理、用量统计及 Webhook 回调的前端控制台，让客户可以直接通过 API 调用你的服务。",
      "第三步：面向特定行业（如物流、财税、外贸供应链）做垂直落地推介，在垂直自媒体发布白皮书或客户案例故事。"
    ],
    "keyMetrics": {
      "mrr": "$40,000",
      "startupCost": "$1,000",
      "timeToFirstRevenue": "365天",
      "teamSize": "2人"
    },
    "featured": false
  },
  {
    "id": "visa-requirement-tool",
    "name": "签证要求查询聚合器",
    "nameEn": "Visa Requirement Aggregator",
    "category": [
      "旅行工具",
      "信息聚合"
    ],
    "tags": [
      "旅行",
      "数据聚合",
      "SEO"
    ],
    "revenue": 20000,
    "revenueDisplay": "$20K/月",
    "startupCost": 100,
    "startupDays": 60,
    "replicabilityScore": 8,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "广告 + 联盟营销",
    "marketingChannels": [
      "SEO",
      "Google",
      "社交媒体"
    ],
    "techStack": [
      "Ruby on Rails",
      "PostgreSQL",
      "Google Adsense"
    ],
    "heroEmoji": "✈️",
    "heroColor": "#F59E0B",
    "summary": "聚合全球200+国签证要求信息，靠SEO流量月赚$20K的一人信息网站。",
    "insight": "「数据聚合 + SEO」商业模式的教科书案例。签证信息分散在各大使馆网站，繁琐难查。创始人建立结构化数据库，配合精准长尾SEO，获得大量自然流量。关键：数据护城河 + 被动流量。",
    "chinaOpportunity": "针对中国出境游市场，做「护照含金量查询 + 签证攻略」平台，与旅行社、签证代办合作获取佣金收入。小红书/抖音种草带流量。",
    "productArch": "全球签证政策爬虫/定时更新器 ➔ 关系型数据库 (PostgreSQL) ➔ SEO 自动落地页生成器 (按照'护照持有国 + 目标出行国'组合生成数万个子页面) ➔ 前端展示模板 ➔ 广告/返利系统。",
    "businessLoop": "【零成本引流】：依靠几十万个细分长尾页面在搜索引擎中拿到第一排名 ➔ 【用户留存】：用户查询时提供订阅目的国签证变更预警通知 ➔ 【流量变现】：在核心位置挂载机酒预订（携程/Booking）联盟返利链接、及在线签证代办服务 ➔ 【飞轮】：用户生成点评和出行反馈，自动生成更多UGC页面增加SEO收录。",
    "getStartedPath": [
      "第一步：整理全球免签、落地签、电子签的数据集，可以从 Wikipedia 等开源数据起步，手动校对出核心的出发国关系列表。",
      "第二步：设计一个清晰直观的'A国护照 ➔ 去B国'的简明查询单页，并编写脚本批量生成 200x200 种组合的国家落地页做好 SEO 标签。",
      "第三步：去各大旅游论坛（马蜂窝、穷游）回答出境游政策问题，链接导向你的网站；同步在小红书每日发布'某国最新签证变动'卡片图文进行种草引流。"
    ],
    "keyMetrics": {
      "mrr": "$20,000",
      "startupCost": "$100",
      "timeToFirstRevenue": "60天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "crm-attribution-tool",
    "name": "CRM营销归因工具",
    "nameEn": "CRM Marketing Attribution Tool",
    "category": [
      "B2B SaaS",
      "营销技术"
    ],
    "tags": [
      "CRM",
      "Analytics",
      "B2B",
      "MarTech"
    ],
    "revenue": 100000,
    "revenueDisplay": "$100K/月",
    "startupCost": 1000,
    "startupDays": 30,
    "replicabilityScore": 5,
    "difficulty": "高",
    "teamSize": 5,
    "businessModel": "SaaS订阅（企业版）",
    "marketingChannels": [
      "内容营销",
      "合作伙伴",
      "销售团队"
    ],
    "techStack": [
      "Python",
      "React",
      "PostgreSQL",
      "AWS"
    ],
    "heroEmoji": "🎯",
    "heroColor": "#EF4444",
    "summary": "帮企业搞清楚每一分营销费用到底带来了多少客户，月收$100K的B2B SaaS旗舰产品。",
    "insight": "营销归因是「CMO的噩梦」。$100K/月背后是高客单价（$1000+/月/客户）+ 高留存（客户一旦接入，数据沉淀就是转换成本）。多触点归因模型是核心竞争力。",
    "chinaOpportunity": "国内企业对营销ROI追问越来越精细。可以做「私域+公域」融合的归因工具，覆盖微信生态（公众号、视频号、企业微信）+ 抖音/小红书数据。",
    "productArch": "广告平台及分析数据 SDK ➔ 数据清洗与实时采集引擎 ➔ CRM 数据库同步连接器 (Salesforce/HubSpot) ➔ 归因算法分析模块 (归因模型计算) ➔ 可视化报表。安全性和高可用数据存储至关重要。",
    "businessLoop": "【获客拉新】：深入行业 MarTech 展会、发表营销 ROI 归因深度白皮书，解决 CMO 焦虑 ➔ 【试用体验】：免费接入分析 15 天，找出企业目前浪费最严重的 20% 广告支出 ➔ 【客单变现】：展示出惊人价值后转为年付费订阅，按流量和席位分级收费 ➔ 【垄断优势】：数据一旦积累半年以上，客户几乎无法忍受停用后带来的报表混乱和决策失误。",
    "getStartedPath": [
      "第一步：选取主流的两三个平台（如微信视频号广告、百度推广），开发基础的数据监测 SDK，统计首次触达和末次触达路径。",
      "第二步：编写能与企业微信 CRM 或自建 CRM 数据做匹配清洗的 Python 脚本，用一两个核心归因模型（如首击、线性分摊）算出转化漏斗。",
      "第三步：面向中小电商或获客成本极高的 B2B 团队做定向销售，提供'帮您省掉一半广告浪费'的陪跑服务作为敲门砖。"
    ],
    "keyMetrics": {
      "mrr": "$100,000",
      "startupCost": "$1,000",
      "timeToFirstRevenue": "30天",
      "teamSize": "5人"
    },
    "featured": true
  },
  {
    "id": "solopreneur-courses",
    "name": "一人公司知识课程平台",
    "nameEn": "Solopreneur Knowledge Courses",
    "category": [
      "知识付费",
      "在线教育"
    ],
    "tags": [
      "课程",
      "创业",
      "Solopreneur"
    ],
    "revenue": 100000,
    "revenueDisplay": "$100K/月",
    "startupCost": 1000,
    "startupDays": 90,
    "replicabilityScore": 8,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "课程销售 + 会员订阅",
    "marketingChannels": [
      "Twitter/X",
      "Newsletter",
      "播客",
      "YouTube"
    ],
    "techStack": [
      "Kajabi",
      "Substack",
      "Circle"
    ],
    "heroEmoji": "🎓",
    "heroColor": "#14B8A6",
    "summary": "一个人，教另一群人如何做一人公司，靠个人IP + 课程订阅月赚$100K的内容创业。",
    "insight": "「个人品牌 + 知识变现」的终极形态。飞轮效应显著：内容吸引受众 → 受众信任购买课程 → 成功案例成为更多内容素材。一人公司话题在后疫情时代全球爆发，受众基数巨大。",
    "chinaOpportunity": "国内「副业/创业」赛道极热，知识付费市场成熟。可以做「一人公司」主题的知识星球+视频号矩阵，覆盖「副业选品」「独立开发」「自媒体变现」等细分主题。",
    "productArch": "知识输出载体 (公众号/视频号/小红书) ➔ 付费承载与交付平台 (知识星球/微信小程序课程/飞书社群) ➔ 会员裂变体系。低技术门槛，核心在于极其体系化的内容和有实操性的模板资产。",
    "businessLoop": "【信任飞轮】：每日在社交媒体分享极其具体的个人真实盈利项目细节，建立'干货、真实、专业'的 IP ➔ 【引流私域】：提供一份高质量的电子书或清单作为钩子吸引加群 ➔ 【社群变现】：推出低门槛副业星球（￥199）和高客单实操营（￥2999） ➔ 【口碑裂变】：学员成功后输出战报，引来新一轮高意向客户。",
    "getStartedPath": [
      "第一步：梳理你最擅长的某一细分技能（如：某AI工具应用、海外建站、特定设计），整理出前 20 篇高干货、无废话的分析笔记。",
      "第二步：入驻小红书/知乎，以'保姆级教程'风格持续输出，收集读者的常见痛点并在评论区进行深入解答建立权威感。",
      "第三步：开设知识星球或微信订阅社群，设置合理的会员价，配合免费赠送的实操模版工具开始批量转化粉丝。"
    ],
    "keyMetrics": {
      "mrr": "$100,000",
      "startupCost": "$1,000",
      "timeToFirstRevenue": "90天",
      "teamSize": "1人"
    },
    "featured": true
  },
  {
    "id": "no-code-agency",
    "name": "无代码应用开发机构",
    "nameEn": "No-Code App Development Agency",
    "category": [
      "服务类",
      "代理机构"
    ],
    "tags": [
      "No-code",
      "服务",
      "Bubble",
      "外包"
    ],
    "revenue": 100000,
    "revenueDisplay": "$100K/月",
    "startupCost": 0,
    "startupDays": 30,
    "replicabilityScore": 8,
    "difficulty": "中",
    "teamSize": 5,
    "businessModel": "项目制收费 + 月度维护",
    "marketingChannels": [
      "LinkedIn",
      "口碑推荐",
      "Upwork"
    ],
    "techStack": [
      "Bubble",
      "Webflow",
      "Zapier",
      "Airtable"
    ],
    "heroEmoji": "🚀",
    "heroColor": "#A855F7",
    "summary": "17岁创始人，用Bubble为初创公司建App，从0到$100K/月的无代码开发机构。",
    "insight": "无代码开发机构本质是「技能套利」：学会工具，服务雇不起全职开发的中小企业。传统开发需$50K+，无代码版本只需$5-20K，性价比明显。这本身就是强大的营销故事。",
    "chinaOpportunity": "国内对应的机会是「微信小程序无代码开发」「飞书应用定制」。中小企业数字化需求爆发，但成本敏感，无代码方案完美切入。",
    "productArch": "无代码开发平台 (Bubble/云开发/微搭) ➔ API 中间件 (Zapier/Make/飞书集成) ➔ 数据存储 (Airtable/腾讯文档) ➔ 支付/身份认证服务。无需庞大程序员团队，由 1-2 名全栈无代码开发师即可承接中大型项目。",
    "businessLoop": "【超快交付定位】：主打'1-2周上线MVP App'，极大降低初创团队的开发资金和时间风险 ➔ 【口碑转化】：在求职及外包平台（如 Upwork/猪八戒）发布竞标，用低于同行一半的报价和极速的上线速度拿下首批单子 ➔ 【二开锁死】：APP上线后，提供后续月度无代码后台运维订阅（如￥999/月），创造持续性被动收入 ➔ 【生态合作】：成为无代码平台官方合作伙伴，获取平台导流。",
    "getStartedPath": [
      "第一步：花 2-3 周深入学习 Bubble 或国内的微搭、宜搭等低代码平台，用它们独立做出 2-3 个主流 App 仿版作为作品集。",
      "第二步：在各大自由职业平台、接单群发布你的接单名片，重点突出'无代码极速开发，2周即可上线'这一卖点。",
      "第三步：服务好前三个客户，收集他们的推荐语和项目上线数据，写成复盘案例文章发在专业技术圈，吸引更多企业客户主动咨询。"
    ],
    "keyMetrics": {
      "mrr": "$100,000",
      "startupCost": "$0",
      "timeToFirstRevenue": "30天",
      "teamSize": "5人"
    },
    "featured": true
  },
  {
    "id": "ai-music-video-generator",
    "name": "AI音乐视频生成器",
    "nameEn": "AI Music Video Generator",
    "category": [
      "AI工具",
      "创意工具"
    ],
    "tags": [
      "AI",
      "音乐",
      "视频",
      "创作者工具"
    ],
    "revenue": 20000,
    "revenueDisplay": "$20K/月",
    "startupCost": 500,
    "startupDays": 40,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 2,
    "businessModel": "按次付费 + 会员订阅",
    "marketingChannels": [
      "TikTok",
      "Instagram",
      "YouTube"
    ],
    "techStack": [
      "Python",
      "Stable Diffusion",
      "FFmpeg",
      "AWS"
    ],
    "heroEmoji": "🎵",
    "heroColor": "#F97316",
    "summary": "上传一首歌，AI自动生成配套MV，音乐人和内容创作者的新利器，月收$20K。",
    "insight": "「AI + 创意工具」在2024-2025年爆发。音乐人缺MV但MV制作昂贵，这个工具填补了「好看且便宜」的空白。病毒式传播是核心：用户会自发分享她们生成的视频。",
    "chinaOpportunity": "国内音乐人、独立歌手、抖音/快手MCN机构都有强需求。结合国内流行风格（古风、国潮），做针对中文歌曲优化的AI MV生成工具。",
    "productArch": "前端网页界面 ➔ 音频特征提取器 (提取 BPM、情感、歌词时间戳) ➔ 图像/视频生成模块 (Stable Diffusion 结合 AnimateDiff，依节奏和主题生成对应画面) ➔ FFmpeg 自动合流 ➔ 云端存储下载。",
    "businessLoop": "【流量裂变】：用户（往往是音乐人或博主）生成精彩的 AI MV 并发布到抖音和视频号，天然带水印引流 ➔ 【免费试用】：提供前30秒视频低清版免费生成，全长及高清版需要充值 ➔ 【阶梯消费】：按渲染时长或分辨率（单次￥9 或月卡会员￥59/月）收费 ➔ 【版权生态】：支持导出商业授权书，锁定企业及音乐厂牌客户。",
    "getStartedPath": [
      "第一步：基于 Python + Flask + WebUI 搭建一个简单的原型，能够提取音乐文件的声谱及节奏变化并联动 Stable Diffusion 渲染简单的卡点视频。",
      "第二步：优化渲染和合流管道，使用 ComfyUI 的 API 批量加速生成，配合前端完成可视化的上传与下载流程。",
      "第三步：在抖音、B站注册账号，把独立音乐人的一些未发布小样用你的工具做出极其梦幻迷离的 AI MV 并艾特原作者，极易带来现象级传播和导流。"
    ],
    "keyMetrics": {
      "mrr": "$20,000",
      "startupCost": "$500",
      "timeToFirstRevenue": "40天",
      "teamSize": "2人"
    },
    "featured": false
  },
  {
    "id": "website-building-course",
    "name": "建站视频课程",
    "nameEn": "Website Building Video Course",
    "category": [
      "在线教育",
      "技能培训"
    ],
    "tags": [
      "课程",
      "No-code",
      "建站",
      "教育"
    ],
    "revenue": 40000,
    "revenueDisplay": "$40K/月",
    "startupCost": 500,
    "startupDays": 30,
    "replicabilityScore": 9,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "一次性课程销售 + Upsell",
    "marketingChannels": [
      "YouTube",
      "SEO",
      "Email"
    ],
    "techStack": [
      "Teachable",
      "Notion",
      "Loom"
    ],
    "heroEmoji": "🌐",
    "heroColor": "#6366F1",
    "summary": "手把手教人用Webflow/Wix建网站，一次录课永久卖，月收$40K的被动收入机器。",
    "insight": "「教别人你已经会的技能」是最低门槛的知识变现方式。创始人花30天录制课程，此后几乎全靠YouTube自然流量被动获客。课程一次制作，无限次销售，边际成本接近零。",
    "chinaOpportunity": "国内小微企业对「低成本建网站」需求旺盛。可以做「微信小程序开发教程」或「Shopify/独立站建站课」，在B站/抖音发免费片段，完整课程收费。",
    "productArch": "视频录制与剪辑 (Loom / OBS) ➔ 课件与模板资源打包 (Notion/网盘) ➔ 在线课程交付系统 (小鹅通/荔枝微课/腾讯课堂) ➔ 微信售后答疑群。",
    "businessLoop": "【高热度长尾引流】：在B站和抖音常态化更新各种建站疑难解答小视频，评论区抛出'新手大礼包'引导私域 ➔ 【打包变现】：低价销售一整套包含建站视频、常用代码、高质量 UI 模版在内的实战课（如￥299） ➔ 【高价值升单】：针对有定制需求的学员，提供￥2999以上的个人建站指导或直接承接他们的企业建站外包单 ➔ 【闭环迭代】：优秀学员可以发展为助教或代理，参与销售提成。",
    "getStartedPath": [
      "第一步：花一个月录制好 20 节由浅入深的建站实操网课（不要讲枯燥理论，重点是带着大家做出一个上线运行的网站）。",
      "第二步：整理一套独家定制的开箱即用网页模板（这是极高溢价的卖点，新手非常需要现成模板）。",
      "第三步：在 B 站发布几期'手把手教新手1小时做出好看网站'的长视频，并把核心干货模板链接放在评论区，引导大家去你的付费课程学习。"
    ],
    "keyMetrics": {
      "mrr": "$40,000",
      "startupCost": "$500",
      "timeToFirstRevenue": "30天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "data-visualization-platform",
    "name": "零代码数据可视化平台",
    "nameEn": "Data Visualization Platform",
    "category": [
      "Micro-SaaS",
      "数据工具"
    ],
    "tags": [
      "No-code",
      "BI",
      "数据分析"
    ],
    "revenue": 10000,
    "revenueDisplay": "$10K/月",
    "startupCost": 500,
    "startupDays": 7,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅",
    "marketingChannels": [
      "Product Hunt",
      "Twitter",
      "IndieHackers"
    ],
    "techStack": [
      "React",
      "D3.js",
      "Node.js",
      "MongoDB"
    ],
    "heroEmoji": "📈",
    "heroColor": "#EC4899",
    "summary": "7天上线的零代码图表工具，让非技术人员轻松制作专业数据可视化，月收$10K。",
    "insight": "找到了「简单≠简陋」的细分市场。目标用户不是数据工程师，而是市场、运营等没有技术背景的团队成员。95%用户只需要5%的功能，简洁就是竞争力。7天MVP上线快速验证。",
    "chinaOpportunity": "国内中小企业对轻量BI工具需求旺盛。可以做「一分钟出报表」工具，支持上传Excel直接生成图表，集成微信分享。目标用户：电商运营、品牌方、小团队负责人。",
    "productArch": "在线富文本/拖拽编辑器 (React) ➔ 图表转换内核 (D3.js / ECharts) ➔ 云端主题及配色预设库 ➔ 网页一键嵌入代码及图片导出模块 ➔ 账号系统。",
    "businessLoop": "【痛点切入】：非技术人员无法写代码，且厌恶复杂臃肿的 BI 软件，只需要快速出一张好看的图插在 PPT 或周报里 ➔ 【体验闭环】：免费使用所有基础图表，但只能导出带水印图 ➔ 【去水订阅】：￥19/月或￥99/年订阅会员，可解锁精美配色模板、去除水印并支持无损图片导出 ➔ 【自发传播】：用户做好的精美图表分享给同事或发在社群，底部的'图表由某某平台生成'天然拉新。",
    "getStartedPath": [
      "第一步：基于 React 结合百度开源的 ECharts 图表库，搭建一个可以导入数据并实时生成精美可视化图表的 Web APP。",
      "第二步：设计并精心微调 10 套极其现代、扁平的高级商业配色，让生成的图表天然比普通 Excel 图表高级几倍。",
      "第三步：在小红书、知乎发布'拯救审美！如何用这款工具3秒做出高逼格 PPT 数据图'，直接用视觉效果拉新获客。"
    ],
    "keyMetrics": {
      "mrr": "$10,000",
      "startupCost": "$500",
      "timeToFirstRevenue": "7天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "newsletter-business",
    "name": "付费Newsletter订阅媒体",
    "nameEn": "Paid Newsletter Business",
    "category": [
      "内容创业",
      "媒体"
    ],
    "tags": [
      "Newsletter",
      "内容",
      "订阅",
      "个人媒体"
    ],
    "revenue": 50000,
    "revenueDisplay": "$50K/月",
    "startupCost": 0,
    "startupDays": 180,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "订阅制（$10-30/月）",
    "marketingChannels": [
      "Twitter/X",
      "LinkedIn",
      "推荐裂变",
      "播客"
    ],
    "techStack": [
      "Substack",
      "Beehiiv",
      "ConvertKit"
    ],
    "heroEmoji": "📬",
    "heroColor": "#84CC16",
    "summary": "每周发一封关于某个垂直领域的深度Newsletter，建立付费订阅者社区，月收$50K。",
    "insight": "Newsletter是「个人媒体」的最纯粹形式。在算法泛滥时代，用户愿意为「精选」买单。成功关键：垂直细分 + 作者信任度 + 持续输出。一旦建立付费习惯，留存率极高（70%+），可预测现金流。",
    "chinaOpportunity": "国内对应的是「知识星球」「公众号付费」。可以做垂直领域的「星球 + 公众号」双端组合：公众号免费内容引流，星球付费深度内容变现。热门垂直：独立开发、AI工具、海外创业等。",
    "productArch": "专业邮件发送/订阅管理平台 (Beehiiv/Substack) ➔ 域名与博客系统 ➔ 独家研究数据库 (Notion/Airtable) ➔ 社群交付 (微信群/飞书群)。纯内容流驱动，无需编写代码。",
    "businessLoop": "【高价值内容输出】：通过持续输出高品质、市面上没有的垂直洞察，确立行业专家 IP ➔ 【邮件名单积累】：通过免费提供深度行业报告，引导读者在落地页留下邮箱或关注公众号 ➔ 【付费墙订阅】：每周固定提供两期深度拆解或精选雷达，其中核心的实操和敏感行业分析放入付费墙，支持包月/包年订阅 ➔ 【广告收益】：名单规模达到 5K 以上后，接受广告赞助，实现双重变现。",
    "getStartedPath": [
      "第一步：选定一个极度细分且有商业价值的赛道（如：海外独立开发周刊、某前沿技术在垂直行业的落地应用）。",
      "第二步：在 Substack、Beehiiv 或国内的公众号上搭建好发布专栏，设定极具辨识度的视觉风格和发布频率。",
      "第三步：去知乎、即刻、Twitter(X) 以及行业微信群积极发表深入浅出的长评论，在个人简介挂上订阅链接进行冷启动。"
    ],
    "keyMetrics": {
      "mrr": "$50,000",
      "startupCost": "$0",
      "timeToFirstRevenue": "180天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "bachelorette-party-app",
    "name": "闺蜜旅行策划App",
    "nameEn": "Bachelorette Party Planning App",
    "category": [
      "消费应用",
      "活动策划"
    ],
    "tags": [
      "App",
      "活动",
      "社交",
      "消费者"
    ],
    "revenue": 83000,
    "revenueDisplay": "$83K/月",
    "startupCost": 5000,
    "startupDays": 180,
    "replicabilityScore": 6,
    "difficulty": "中高",
    "teamSize": 3,
    "businessModel": "应用内购买 + 订阅",
    "marketingChannels": [
      "TikTok",
      "Instagram",
      "Pinterest",
      "口碑"
    ],
    "techStack": [
      "React Native",
      "Firebase",
      "Stripe"
    ],
    "heroEmoji": "🎉",
    "heroColor": "#F43F5E",
    "summary": "把单身派对策划从繁琐的群聊变成一键搞定的App，年净收入$1M+。",
    "insight": "「社交场景 + 效率工具」的绝妙结合。TikTok病毒式传播是核心获客引擎——用户会自发分享她们用App策划派对的过程。社交产品的网络效应让获客成本越来越低。",
    "chinaOpportunity": "中国对应场景是「婚前派对/闺蜜旅行/团建策划」。微信小程序形式最合适，结合「AA收款」功能，定位年轻女性群体。小红书是最理想的获客渠道。",
    "productArch": "移动端应用 (React Native/微信小程序) ➔ 实时后端与协同引擎 (Firebase/Node.js) ➔ 地图与商户推荐集成 (高德/美团 API) ➔ 众筹AA收款系统 (微信支付) ➔ 相册云共享模块。",
    "businessLoop": "【痛点突破】：闺蜜/死党聚会经常卡在'商量去哪、定方案、AA收钱'这些琐碎环节，用 App 模板一键解决 ➔ 【病毒获客】：发起人策划完聚会，一键分享到微信群邀请好友入群，每单天然带来 5-10 倍裂变 ➔ 【多维变现】：提供精美派对定制攻略（付费解锁）、内置的 AA 账单超限增值服务、及合作民宿/餐厅门票的分销佣金 ➔ 【网络留存】：沉淀了旅行过程中的精美共享相册与账单，成为无法删除的共同回忆。",
    "getStartedPath": [
      "第一步：不要做复杂的原生 APP，使用微信小程序在 1 个月内做出一款核心只有'多人行程投票确认+AA账单记账'的基础功能版。",
      "第二步：设计 3 套最受小红书群体喜欢的'网红闺蜜出行线路模版'，让行程规划可以直接一键套用。",
      "第三步：在小红书发布'不撕逼！闺蜜出行必用的一键行程小程序'，分享你们的旅途规划干货，直接吸引用户裂变自传。"
    ],
    "keyMetrics": {
      "mrr": "$83,000",
      "startupCost": "$5,000",
      "timeToFirstRevenue": "180天",
      "teamSize": "3人"
    },
    "featured": false
  },
  {
    "id": "pressure-washing-business",
    "name": "高压冲洗服务",
    "nameEn": "Pressure Washing Business",
    "category": [
      "本地服务",
      "线下生意"
    ],
    "tags": [
      "本地服务",
      "低门槛",
      "现金流"
    ],
    "revenue": 30000,
    "revenueDisplay": "$30K/月",
    "startupCost": 3000,
    "startupDays": 14,
    "replicabilityScore": 10,
    "difficulty": "极低",
    "teamSize": 2,
    "businessModel": "按次收费 + 季度套餐",
    "marketingChannels": [
      "谷歌本地广告",
      "Nextdoor",
      "口碑"
    ],
    "techStack": [
      "专业高压水枪设备",
      "预约系统App"
    ],
    "heroEmoji": "💧",
    "heroColor": "#06B6D4",
    "summary": "买一台高压水枪，帮人冲洗车道、外墙、停车场，14天内月赚$30K的实体小生意。",
    "insight": "实体服务的逆袭故事。在所有人都追捧数字化的时代，有人靠洗车道月赚$30K。关键：需求刚需持续、进入门槛低、竞争者少（大多数人看不上）、现金流即时。无聊的生意往往最赚钱。",
    "chinaOpportunity": "国内对应的是「上门保洁」「开荒保洁」「外墙清洗」。可以搭建本地生活服务品牌，用美团/抖音本地生活获客，标准化服务流程后快速扩张同城多个区域。",
    "productArch": "硬件设备 (高配置冷热水高压清洗机) ➔ 客户预约与派单系统 (简单的微信小程序) ➔ 本地生活平台商户端 ➔ 微信/支付宝收款 ➔ 工人结算分配系统。",
    "businessLoop": "【痛点落地】：物业/商户/别墅外墙或地面日积月累的污垢极难清理，高压冲洗视觉冲击力极强、效果立竿见影 ➔ 【本地引流】：在美团、抖音本地生活发布'冲洗前后对比'解压短视频，配合超值首单体验 ➔ 【高客单变现】：冲洗完体验满意，现场引导客户签下'一年冲洗4次'的深度洁净套餐 ➔ 【规模复制】：服务标准化后，按单分成招募零工，自己专心做获客和派单。",
    "getStartedPath": [
      "第一步：购买一套高质量的专业高压冲洗设备，去附近朋友的店面或自家车道拍几组极度解压的清洗前后对比视频。",
      "第二步：在美团本地生活、58同城注册服务，上线极其优惠的'首单体验价'，设计一套标准的服务SOP和反馈卡片。",
      "第三步：去本地的餐饮街、洗车场、私人别墅区做定向扫街推广，通过短视频给老板直观展示冲洗效果，迅速拿下第一批订单。"
    ],
    "keyMetrics": {
      "mrr": "$30,000",
      "startupCost": "$3,000",
      "timeToFirstRevenue": "14天",
      "teamSize": "2人"
    },
    "featured": false
  },
  {
    "id": "data-import-airtable",
    "name": "效率工具插件生态位",
    "nameEn": "Data Import Tool for Airtable",
    "category": [
      "效率工具",
      "Micro-SaaS"
    ],
    "tags": [
      "Airtable",
      "自动化",
      "No-code",
      "平台生态"
    ],
    "revenue": 20000,
    "revenueDisplay": "$20K/月",
    "startupCost": 100,
    "startupDays": 90,
    "replicabilityScore": 7,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅",
    "marketingChannels": [
      "Airtable社区",
      "ProductHunt",
      "Reddit"
    ],
    "techStack": [
      "Node.js",
      "Airtable API",
      "Stripe"
    ],
    "heroEmoji": "🔄",
    "heroColor": "#22C55E",
    "summary": "解决Airtable批量导入数据的痛点，服务30万+ Airtable用户，月收$20K。",
    "insight": "「平台插件」是风险与收益共存的模式。在平台生态里找到具体痛点，获客成本极低（社区自然推荐）。关键是找到「平台不想做、但用户真需要」的功能缺口。",
    "chinaOpportunity": "国内对应的产品是「飞书多维表格插件」「腾讯文档增强工具」。飞书有数百万企业用户，但生态插件还不丰富，先发者机会大。在飞书开放平台市场发布，获取免费曝光。",
    "productArch": "飞书/Airtable 插件前端 (基于平台官方 SDK 构建) ➔ 数据映射与解析转换器 (处理不同源文件的列对齐) ➔ 平台 API 导入管道 ➔ 增量计费层。依附大平台运行，技术设施极轻薄。",
    "businessLoop": "【生态寄生】：寄生于官方插件市场，精准拦截在平台内遇到了'表格导入格式总是错乱'的用户 ➔ 【极速转化】：在官方插件商店一键启用，提供单次小量免费导入体验 ➔ 【订阅变现】：针对有每天自动同步、批量上万行数据导入的企业客户，收取 $19-49/月订阅费 ➔ 【高墙自护】：因为无缝嵌入了用户原本在 Airtable/飞书中的工作流，极具黏性。",
    "getStartedPath": [
      "第一步：进入飞书开发人员文档或 Airtable Developer Hub，研究平台提供的插件 SDK 限制和可调用接口。",
      "第二步：设计一个专解'批量自动导入并进行列自动识别转换映射'的原型插件，能够解析 Excel、JSON 等各种文件。",
      "第三步：直接在官方应用商店上架，并在相关的多维表格技术交流论坛、飞书服务商群里做功能推介获取首批流量。"
    ],
    "keyMetrics": {
      "mrr": "$20,000",
      "startupCost": "$100",
      "timeToFirstRevenue": "90天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-1",
    "name": "AI Logo 生成器",
    "nameEn": "AI Logo Generator",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 18000,
    "revenueDisplay": "$18K/月",
    "startupCost": 300,
    "startupDays": 15,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#F59E0B",
    "summary": "基于文字描述自动生成矢量Logo与品牌规范VI，月收$18K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$18K/月",
      "startupCost": "$300",
      "timeToFirstRevenue": "15天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-2",
    "name": "AI 个人写作助手",
    "nameEn": "AI Personal Writing Copilot",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 25000,
    "revenueDisplay": "$25K/月",
    "startupCost": 200,
    "startupDays": 20,
    "replicabilityScore": 8,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#3B82F6",
    "summary": "专为自媒体博主打造的AI长文写作与排版工具，月收$25K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$25K/月",
      "startupCost": "$200",
      "timeToFirstRevenue": "20天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-3",
    "name": "AI 语音转文字剪辑",
    "nameEn": "AI Audio Transcript Editor",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 32000,
    "revenueDisplay": "$32K/月",
    "startupCost": 800,
    "startupDays": 45,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#F59E0B",
    "summary": "像修改文档一样剪辑播客与视频语音，月收$32K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$32K/月",
      "startupCost": "$800",
      "timeToFirstRevenue": "45天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-4",
    "name": "AI 智能代码审查器",
    "nameEn": "AI Code Review Bot",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 45000,
    "revenueDisplay": "$45K/月",
    "startupCost": 1000,
    "startupDays": 60,
    "replicabilityScore": 8,
    "difficulty": "低中",
    "teamSize": 3,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#8B5CF6",
    "summary": "自动拉取 PR 并检测代码漏洞与性能隐患，月收$45K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$45K/月",
      "startupCost": "$1000",
      "timeToFirstRevenue": "60天",
      "teamSize": "3人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-5",
    "name": "AI 二维码艺术生成",
    "nameEn": "AI Artistic QR Generator",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 12000,
    "revenueDisplay": "$12K/月",
    "startupCost": 150,
    "startupDays": 7,
    "replicabilityScore": 9,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#10B981",
    "summary": "将普通网址转换为极具视觉冲击力的艺术二维码，月收$12K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$12K/月",
      "startupCost": "$150",
      "timeToFirstRevenue": "7天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-6",
    "name": "AI 客服聊天机器人",
    "nameEn": "AI Customer Support Agent",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 55000,
    "revenueDisplay": "$55K/月",
    "startupCost": 1500,
    "startupDays": 90,
    "replicabilityScore": 7,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#10B981",
    "summary": "导入企业知识库，一键替代 80% 常见人工客服询盘，月收$55K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$55K/月",
      "startupCost": "$1500",
      "timeToFirstRevenue": "90天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-7",
    "name": "AI 简历优化专家",
    "nameEn": "AI Resume Optimizer & Builder",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 15000,
    "revenueDisplay": "$15K/月",
    "startupCost": 100,
    "startupDays": 10,
    "replicabilityScore": 9,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#8B5CF6",
    "summary": "针对职位 JD 自动匹配并重构简历关键词，提升面试率，月收$15K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$15K/月",
      "startupCost": "$100",
      "timeToFirstRevenue": "10天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-8",
    "name": "AI 简报 PPT 一键生成",
    "nameEn": "AI Presentation Generator",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 38000,
    "revenueDisplay": "$38K/月",
    "startupCost": 500,
    "startupDays": 30,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#8B5CF6",
    "summary": "输入主题大纲，30秒自动生成带精美图表与排版的演示文稿，月收$38K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$38K/月",
      "startupCost": "$500",
      "timeToFirstRevenue": "30天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-9",
    "name": "AI 智能名片与社交转化",
    "nameEn": "AI Smart Card Hub",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 9000,
    "revenueDisplay": "$9K/月",
    "startupCost": 80,
    "startupDays": 5,
    "replicabilityScore": 9,
    "difficulty": "低",
    "teamSize": 2,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#3B82F6",
    "summary": "电子名片结合 AI 自动回答与名片识别，月收$9K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$9K/月",
      "startupCost": "$80",
      "timeToFirstRevenue": "5天",
      "teamSize": "2人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-10",
    "name": "AI 图像去背景与修复",
    "nameEn": "AI Background Remover Pro",
    "category": [
      "AI工具",
      "Micro-SaaS"
    ],
    "tags": [
      "AI",
      "独立开发",
      "效率工具"
    ],
    "revenue": 28000,
    "revenueDisplay": "$28K/月",
    "startupCost": 300,
    "startupDays": 14,
    "replicabilityScore": 9,
    "difficulty": "中",
    "teamSize": 3,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🤖",
    "heroColor": "#8B5CF6",
    "summary": "电商卖家高频刚需，高清图像一键抠图与光影重构，月收$28K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (AI工具) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$28K/月",
      "startupCost": "$300",
      "timeToFirstRevenue": "14天",
      "teamSize": "3人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-11",
    "name": "Notion 网页自动化发布",
    "nameEn": "Notion Site Publisher",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 16000,
    "revenueDisplay": "$16K/月",
    "startupCost": 200,
    "startupDays": 14,
    "replicabilityScore": 8,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#6366F1",
    "summary": "把 Notion 文档一键转为 SEO 优化的独立博客与官网，月收$16K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$16K/月",
      "startupCost": "$200",
      "timeToFirstRevenue": "14天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-12",
    "name": "GitHub 静态博客组件包",
    "nameEn": "GitHub Markdown Components",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 8000,
    "revenueDisplay": "$8K/月",
    "startupCost": 50,
    "startupDays": 7,
    "replicabilityScore": 9,
    "difficulty": "中",
    "teamSize": 3,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#0EA5E9",
    "summary": "为开源作者提供开箱即用的文档插画与赞助组件，月收$8K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$8K/月",
      "startupCost": "$50",
      "timeToFirstRevenue": "7天",
      "teamSize": "3人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-13",
    "name": "多平台社交媒体定时发布",
    "nameEn": "Cross-Platform Social Scheduler",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 42000,
    "revenueDisplay": "$42K/月",
    "startupCost": 600,
    "startupDays": 40,
    "replicabilityScore": 7,
    "difficulty": "低中",
    "teamSize": 3,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#F43F5E",
    "summary": "一次编辑，一键分发到 Twitter、LinkedIn、YouTube，月收$42K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$42K/月",
      "startupCost": "$600",
      "timeToFirstRevenue": "40天",
      "teamSize": "3人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-14",
    "name": "Stripe 客户退款预警器",
    "nameEn": "Stripe Churn Prevention Bot",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 22000,
    "revenueDisplay": "$22K/月",
    "startupCost": 300,
    "startupDays": 30,
    "replicabilityScore": 8,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#A855F7",
    "summary": "当客户信用卡扣款失败时，自动发送跟进挽留邮件，月收$22K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$22K/月",
      "startupCost": "$300",
      "timeToFirstRevenue": "30天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-15",
    "name": "冷邮件验证与清洗服务",
    "nameEn": "Cold Email Verifier & Cleaner",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 35000,
    "revenueDisplay": "$35K/月",
    "startupCost": 400,
    "startupDays": 25,
    "replicabilityScore": 9,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#0EA5E9",
    "summary": "批量检测邮箱有效性，提升外贸开开发信送达率，月收$35K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$35K/月",
      "startupCost": "$400",
      "timeToFirstRevenue": "25天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-16",
    "name": "Figma 导出代码插件",
    "nameEn": "Figma to React Code Export",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 19000,
    "revenueDisplay": "$19K/月",
    "startupCost": 200,
    "startupDays": 20,
    "replicabilityScore": 8,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#6366F1",
    "summary": "把设计稿一键转化为干净可运行的 Tailwind 代码，月收$19K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$19K/月",
      "startupCost": "$200",
      "timeToFirstRevenue": "20天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-17",
    "name": "开发者 API 监控看板",
    "nameEn": "Developer API Uptime Monitor",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 14000,
    "revenueDisplay": "$14K/月",
    "startupCost": 150,
    "startupDays": 15,
    "replicabilityScore": 7,
    "difficulty": "中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#6366F1",
    "summary": "秒级监控第三方 API 状态，遭遇故障时通过微信/钉钉报警，月收$14K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$14K/月",
      "startupCost": "$150",
      "timeToFirstRevenue": "15天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-18",
    "name": "Shopify 弃购挽回弹窗",
    "nameEn": "Shopify Abandoned Cart Pop",
    "category": [
      "Micro-SaaS",
      "效率工具"
    ],
    "tags": [
      "No-code",
      "B2B",
      "自动化"
    ],
    "revenue": 30000,
    "revenueDisplay": "$30K/月",
    "startupCost": 250,
    "startupDays": 18,
    "replicabilityScore": 8,
    "difficulty": "低中",
    "teamSize": 2,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "⚡",
    "heroColor": "#6366F1",
    "summary": "在买家即将关掉网页时弹出精准优惠券，提升订单转化率，月收$30K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (Micro-SaaS) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$30K/月",
      "startupCost": "$250",
      "timeToFirstRevenue": "18天",
      "teamSize": "2人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-19",
    "name": "独立开发者启动模版社群",
    "nameEn": "Indie Hacker Boilerplate Club",
    "category": [
      "内容创业",
      "知识付费"
    ],
    "tags": [
      "个人品牌",
      "课程",
      "订阅"
    ],
    "revenue": 68000,
    "revenueDisplay": "$68K/月",
    "startupCost": 500,
    "startupDays": 45,
    "replicabilityScore": 7,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🎓",
    "heroColor": "#10B981",
    "summary": "提供开箱即用的 Next.js + Stripe 脚手架与会员社群，月收$68K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (内容创业) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$68K/月",
      "startupCost": "$500",
      "timeToFirstRevenue": "45天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-20",
    "name": "UI 设计规范与图标库",
    "nameEn": "Design System & Icon Bundle",
    "category": [
      "内容创业",
      "知识付费"
    ],
    "tags": [
      "个人品牌",
      "课程",
      "订阅"
    ],
    "revenue": 29000,
    "revenueDisplay": "$29K/月",
    "startupCost": 200,
    "startupDays": 14,
    "replicabilityScore": 6,
    "difficulty": "低",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🎓",
    "heroColor": "#F59E0B",
    "summary": "打包售卖 5000+ 高品质矢量图标与 Figma 设计组件，月收$29K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (内容创业) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$29K/月",
      "startupCost": "$200",
      "timeToFirstRevenue": "14天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-21",
    "name": "海外红人营销联系人库",
    "nameEn": "Influencer Outreach Database",
    "category": [
      "内容创业",
      "知识付费"
    ],
    "tags": [
      "个人品牌",
      "课程",
      "订阅"
    ],
    "revenue": 36000,
    "revenueDisplay": "$36K/月",
    "startupCost": 300,
    "startupDays": 30,
    "replicabilityScore": 9,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🎓",
    "heroColor": "#F59E0B",
    "summary": "整理 5 万名 Tech 领域带货博主联系方式与合作报价，月收$36K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (内容创业) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$36K/月",
      "startupCost": "$300",
      "timeToFirstRevenue": "30天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-22",
    "name": "副业选品与数据周刊",
    "nameEn": "Side Project Niche Weekly",
    "category": [
      "内容创业",
      "知识付费"
    ],
    "tags": [
      "个人品牌",
      "课程",
      "订阅"
    ],
    "revenue": 21000,
    "revenueDisplay": "$21K/月",
    "startupCost": 100,
    "startupDays": 60,
    "replicabilityScore": 8,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🎓",
    "heroColor": "#EC4899",
    "summary": "每周分析 3 个低竞争高利润的副业选品方向，月收$21K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (内容创业) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$21K/月",
      "startupCost": "$100",
      "timeToFirstRevenue": "60天",
      "teamSize": "1人"
    },
    "featured": false
  },
  {
    "id": "auto-proj-23",
    "name": "Python 自动化百宝箱教程",
    "nameEn": "Python Automation Micro-Course",
    "category": [
      "内容创业",
      "知识付费"
    ],
    "tags": [
      "个人品牌",
      "课程",
      "订阅"
    ],
    "revenue": 17000,
    "revenueDisplay": "$17K/月",
    "startupCost": 100,
    "startupDays": 21,
    "replicabilityScore": 6,
    "difficulty": "低中",
    "teamSize": 1,
    "businessModel": "SaaS订阅 / 按次计费",
    "marketingChannels": [
      "SEO",
      "社交媒体",
      "社群裂变"
    ],
    "techStack": [
      "React/Next.js",
      "Python",
      "Stripe/微信支付"
    ],
    "heroEmoji": "🎓",
    "heroColor": "#EC4899",
    "summary": "面向非技术人员的实用办公自动化录播课，一次购买永久学习，月收$17K。",
    "insight": "抓住特定细分领域的效率痛点，通过轻量级 MVP 快速上线，配合精准的内容营销实现高利润产出。",
    "chinaOpportunity": "国内同类场景需求旺盛。可以结合微信生态或小红书进行本土化移植，配合小程序或公众号私域转化。",
    "productArch": "前端界面 (内容创业) ➔ 后端处理管道 ➔ 核心 API 服务 ➔ 支付与交付模块。",
    "businessLoop": "【引流】：自媒体内容/SEO长尾词 ➔ 【体验】：免费试用/基础功能 ➔ 【变现】：SaaS月订阅/按次充值 ➔ 【留存】：数据沉淀与社群。",
    "getStartedPath": [
      "第一步：基于现成开源框架搭建 MVP 基础界面与核心功能演示。",
      "第二步：配置支付接口（如 Stripe / 微信支付），完成基础商业闭环。",
      "第三步：在小红书、B站或行业社群发布实操演示短视频，获取首批种子用户。"
    ],
    "keyMetrics": {
      "mrr": "$17K/月",
      "startupCost": "$100",
      "timeToFirstRevenue": "21天",
      "teamSize": "1人"
    },
    "featured": false
  }
];

const STATS = {
  totalProjects: 2933,
  totalRevenue: "30亿美元/月",
  categoriesCount: 48,
  lastUpdated: "2026-07-21",
  ourCurated: PROJECTS.length
};

const CATEGORIES = [
  { id: "ai-tools", name: "AI工具", icon: "🤖", count: 312 },
  { id: "micro-saas", name: "Micro SaaS", icon: "⚡", count: 487 },
  { id: "content", name: "内容创业", icon: "✍️", count: 234 },
  { id: "ecommerce", name: "电商品牌", icon: "🛒", count: 389 },
  { id: "service", name: "服务类", icon: "🤝", count: 412 },
  { id: "education", name: "知识付费", icon: "🎓", count: 178 },
  { id: "local", name: "本地生意", icon: "📍", count: 256 },
  { id: "no-code", name: "无代码", icon: "🔧", count: 198 }
];

if (typeof module !== 'undefined') module.exports = { PROJECTS, STATS, CATEGORIES };
