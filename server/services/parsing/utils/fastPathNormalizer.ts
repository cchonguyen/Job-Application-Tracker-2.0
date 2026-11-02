import { parseJobTitleAndTeam } from '../../../../src/lib/jobsStore.ts';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { ExtractedJobAttributes } from '../types.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { cleanHtmlDescription, decodeHtmlEntities } from './schemaOrgNormalizer.ts';

export interface FastPathInput {
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  salary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  rawPayload?: any;
}

const COMPANY_PLACEHOLDERS =
  /^(company|unknown|unknown company|direct applicant posting|direct applicant|confidential|hiring organization|employer|n\/a|none|null|undefined)$/i;

const TITLE_PLACEHOLDERS =
  /^(unknown role|unknown|role|job opening|job title|position|open position|career opportunity|untitled|n\/a|none|null|undefined)$/i;

const LOCATION_PLACEHOLDERS =
  /^(unknown|not listed|n\/a|none|null|undefined)$/i;

interface SkillDef {
  name: string;
  pattern: RegExp;
}

// Curated 120+ term taxonomy covering languages, frameworks, cloud, databases, ML/AI, product & design
const SKILLS_TAXONOMY: SkillDef[] = [
  // Programming Languages
  { name: 'TypeScript', pattern: /\bTypeScript\b/i },
  { name: 'JavaScript', pattern: /\bJavaScript\b/i },
  { name: 'Python', pattern: /\bPython\b/i },
  { name: 'Java', pattern: /\bJava\b(?!\s*Script)/i },
  { name: 'Go', pattern: /\b(?:Golang\b|Go\b(?!\s+(?:to|ahead|for|on|with|live|into|through|back|and|or|in|at|by|from|out|up|down|off|over)))/ },
  { name: 'C++', pattern: /\bC\+\+\b/ },
  { name: 'C#', pattern: /\bC#\b|\bC-sharp\b/i },
  { name: 'Rust', pattern: /\bRust\b/i },
  { name: 'Ruby', pattern: /\bRuby\b(?!\s+on\s+Rails)/i },
  { name: 'Ruby on Rails', pattern: /\b(?:Ruby\s+on\s+Rails|Rails)\b/i },
  { name: 'PHP', pattern: /\bPHP\b/i },
  { name: 'Swift', pattern: /\bSwift\b/i },
  { name: 'Kotlin', pattern: /\bKotlin\b/i },
  { name: 'Scala', pattern: /\bScala\b/i },
  { name: 'Elixir', pattern: /\bElixir\b/i },
  { name: 'Dart', pattern: /\bDart\b/i },
  { name: 'R', pattern: /\bR\s+(?:programming|language)\b/i },
  { name: 'Bash', pattern: /\b(?:Bash|Shell\s+scripting)\b/i },

  // Frontend & UI
  { name: 'React', pattern: /\bReact(?:\.js)?\b/i },
  { name: 'Next.js', pattern: /\bNext(?:\.js)?\b/i },
  { name: 'Vue', pattern: /\bVue(?:\.js)?\b/i },
  { name: 'Nuxt', pattern: /\bNuxt(?:\.js)?\b/i },
  { name: 'Angular', pattern: /\bAngular\b/i },
  { name: 'Svelte', pattern: /\bSvelte\b/i },
  { name: 'HTML', pattern: /\bHTML(?:5)?\b/i },
  { name: 'CSS', pattern: /\bCSS(?:3)?\b/i },
  { name: 'Tailwind CSS', pattern: /\bTailwind(?:\s*CSS)?\b/i },
  { name: 'Sass', pattern: /\b(?:Sass|SCSS)\b/i },
  { name: 'Webpack', pattern: /\bWebpack\b/i },
  { name: 'Vite', pattern: /\bVite\b/i },
  { name: 'Redux', pattern: /\bRedux\b/i },
  { name: 'Zustand', pattern: /\bZustand\b/i },
  { name: 'WebSockets', pattern: /\bWebSockets?\b/i },
  { name: 'WebAssembly', pattern: /\b(?:WebAssembly|Wasm)\b/i },

  // Backend & Frameworks
  { name: 'Node.js', pattern: /\bNode(?:\.js)?\b/i },
  { name: 'Express', pattern: /\bExpress(?:\.js)?\b/i },
  { name: 'NestJS', pattern: /\bNest(?:\.js)?\b/i },
  { name: 'Django', pattern: /\bDjango\b/i },
  { name: 'FastAPI', pattern: /\bFastAPI\b/i },
  { name: 'Flask', pattern: /\bFlask\b/i },
  { name: 'Spring Boot', pattern: /\bSpring\s+Boot\b/i },
  { name: 'ASP.NET', pattern: /\b(?:ASP\.NET|\.NET(?:\s+Core)?)\b/i },
  { name: 'GraphQL', pattern: /\bGraphQL\b/i },
  { name: 'REST APIs', pattern: /\bREST(?:ful)?(?:\s+APIs?)?\b/i },
  { name: 'gRPC', pattern: /\bgRPC\b/i },
  { name: 'Microservices', pattern: /\bMicroservices\b/i },

  // Databases & Storage
  { name: 'SQL', pattern: /\bSQL\b/i },
  { name: 'NoSQL', pattern: /\bNoSQL\b/i },
  { name: 'PostgreSQL', pattern: /\b(?:PostgreSQL|Postgres)\b/i },
  { name: 'MySQL', pattern: /\bMySQL\b/i },
  { name: 'MongoDB', pattern: /\bMongoDB\b/i },
  { name: 'Redis', pattern: /\bRedis\b/i },
  { name: 'Elasticsearch', pattern: /\bElasticsearch\b/i },
  { name: 'DynamoDB', pattern: /\bDynamoDB\b/i },
  { name: 'Cassandra', pattern: /\bCassandra\b/i },
  { name: 'Snowflake', pattern: /\bSnowflake\b/i },
  { name: 'BigQuery', pattern: /\bBigQuery\b/i },
  { name: 'Redshift', pattern: /\bRedshift\b/i },
  { name: 'SQLite', pattern: /\bSQLite\b/i },
  { name: 'Supabase', pattern: /\bSupabase\b/i },
  { name: 'Firebase', pattern: /\bFirebase\b/i },
  { name: 'Prisma', pattern: /\bPrisma\b/i },
  { name: 'TypeORM', pattern: /\bTypeORM\b/i },
  { name: 'Drizzle', pattern: /\bDrizzle\b/i },
  { name: 'Neo4j', pattern: /\bNeo4j\b/i },

  // DevOps & Cloud
  { name: 'AWS', pattern: /\bAWS\b|\bAmazon\s+Web\s+Services\b/i },
  { name: 'GCP', pattern: /\bGCP\b|\bGoogle\s+Cloud\b/i },
  { name: 'Azure', pattern: /\b(?:Microsoft\s+)?Azure\b/i },
  { name: 'Docker', pattern: /\bDocker\b/i },
  { name: 'Kubernetes', pattern: /\b(?:Kubernetes|K8s)\b/i },
  { name: 'Terraform', pattern: /\bTerraform\b/i },
  { name: 'Ansible', pattern: /\bAnsible\b/i },
  { name: 'CI/CD', pattern: /\bCI[\/-]CD\b/i },
  { name: 'GitHub Actions', pattern: /\bGitHub\s+Actions\b/i },
  { name: 'GitLab', pattern: /\bGitLab\b/i },
  { name: 'Jenkins', pattern: /\bJenkins\b/i },
  { name: 'Linux', pattern: /\bLinux\b/i },
  { name: 'Kafka', pattern: /\bKafka\b/i },
  { name: 'RabbitMQ', pattern: /\bRabbitMQ\b/i },
  { name: 'Prometheus', pattern: /\bPrometheus\b/i },
  { name: 'Grafana', pattern: /\bGrafana\b/i },
  { name: 'Datadog', pattern: /\bDatadog\b/i },
  { name: 'Serverless', pattern: /\bServerless\b/i },
  { name: 'Cloudflare', pattern: /\bCloudflare\b/i },
  { name: 'Helm', pattern: /\bHelm\b/i },
  { name: 'OpenTelemetry', pattern: /\b(?:OpenTelemetry|OTel)\b/i },

  // ML / AI & Data
  { name: 'Machine Learning', pattern: /\b(?:Machine\s+Learning\b|ML\b)/ },
  { name: 'Deep Learning', pattern: /\bDeep\s+Learning\b/i },
  { name: 'Natural Language Processing', pattern: /\b(?:Natural\s+Language\s+Processing|NLP)\b/i },
  { name: 'Computer Vision', pattern: /\bComputer\s+Vision\b/i },
  { name: 'LLMs', pattern: /\b(?:LLMs?|Large\s+Language\s+Models?)\b/i },
  { name: 'PyTorch', pattern: /\bPyTorch\b/i },
  { name: 'TensorFlow', pattern: /\bTensorFlow\b/i },
  { name: 'Hugging Face', pattern: /\bHugging\s*Face\b/i },
  { name: 'Scikit-Learn', pattern: /\bScikit-Learn\b/i },
  { name: 'Pandas', pattern: /\bPandas\b/i },
  { name: 'NumPy', pattern: /\bNumPy\b/i },
  { name: 'Apache Spark', pattern: /\b(?:Apache\s+)?Spark\b/i },
  { name: 'Airflow', pattern: /\b(?:Apache\s+)?Airflow\b/i },
  { name: 'dbt', pattern: /\bdbt\b/i },
  { name: 'Databricks', pattern: /\bDatabricks\b/i },
  { name: 'ETL', pattern: /\bETL\b/i },
  { name: 'Data Modeling', pattern: /\bData\s+Modeling\b/i },
  { name: 'Data Warehousing', pattern: /\bData\s+Warehous(?:e|ing)\b/i },
  { name: 'Tableau', pattern: /\bTableau\b/i },
  { name: 'Power BI', pattern: /\bPower\s*BI\b/i },
  { name: 'Looker', pattern: /\bLooker\b/i },

  // Mobile
  { name: 'iOS', pattern: /\biOS\b/i },
  { name: 'Android', pattern: /\bAndroid\b/i },
  { name: 'React Native', pattern: /\bReact\s+Native\b/i },
  { name: 'Flutter', pattern: /\bFlutter\b/i },

  // Testing & Quality
  { name: 'Unit Testing', pattern: /\bUnit\s+Testing\b/i },
  { name: 'Integration Testing', pattern: /\bIntegration\s+Testing\b/i },
  { name: 'Jest', pattern: /\bJest\b/i },
  { name: 'Vitest', pattern: /\bVitest\b/i },
  { name: 'Cypress', pattern: /\bCypress\b/i },
  { name: 'Playwright', pattern: /\bPlaywright\b/i },
  { name: 'Selenium', pattern: /\bSelenium\b/i },

  // Architecture & Security
  { name: 'System Design', pattern: /\bSystem\s+Design\b/i },
  { name: 'Distributed Systems', pattern: /\bDistributed\s+Systems\b/i },
  { name: 'Event-Driven Architecture', pattern: /\bEvent-Driven\b/i },
  { name: 'Cybersecurity', pattern: /\b(?:Cybersecurity|Information\s+Security)\b/i },
  { name: 'SOC 2', pattern: /\bSOC\s*2\b/i },
  { name: 'OAuth', pattern: /\bOAuth(?:2\.0)?\b/i },
  { name: 'SSO', pattern: /\b(?:SSO|Single\s+Sign-On)\b/i },
  { name: 'IAM', pattern: /\bIAM\b/i },
  { name: 'Penetration Testing', pattern: /\bPenetration\s+Testing\b/i },

  // Product, Design & Agile
  { name: 'Product Management', pattern: /\bProduct\s+Management\b/i },
  { name: 'Product Strategy', pattern: /\bProduct\s+Strategy\b/i },
  { name: 'User Research', pattern: /\bUser\s+Research\b/i },
  { name: 'Agile', pattern: /\bAgile\b/i },
  { name: 'Scrum', pattern: /\bScrum\b/i },
  { name: 'Kanban', pattern: /\bKanban\b/i },
  { name: 'Figma', pattern: /\bFigma\b/i },
  { name: 'Prototyping', pattern: /\bPrototyping\b/i },
  { name: 'Wireframing', pattern: /\bWireframing\b/i },
  { name: 'A/B Testing', pattern: /\bA\/B\s+Testing\b/i },
  { name: 'Roadmapping', pattern: /\bRoadmapping\b/i },
  { name: 'Product Analytics', pattern: /\bProduct\s+Analytics\b/i },
  { name: 'Mixpanel', pattern: /\bMixpanel\b/i },
  { name: 'Amplitude', pattern: /\bAmplitude\b/i },
  { name: 'Google Analytics', pattern: /\bGoogle\s+Analytics\b/i },

  // Business, Sales & Marketing
  { name: 'CRM', pattern: /\bCRM\b/i },
  { name: 'Salesforce', pattern: /\bSalesforce\b/i },
  { name: 'HubSpot', pattern: /\bHubSpot\b/i },
  { name: 'SEO', pattern: /\bSEO\b/i },
  { name: 'SEM', pattern: /\bSEM\b/i },
  { name: 'Content Strategy', pattern: /\bContent\s+Strategy\b/i },
  { name: 'Copywriting', pattern: /\bCopywriting\b/i },
  { name: 'Lead Generation', pattern: /\bLead\s+Generation\b/i },
  { name: 'Account Management', pattern: /\bAccount\s+Management\b/i },
  { name: 'OpenAPI', pattern: /\b(?:OpenAPI|Swagger)\b/i },
];

/**
 * Deterministically extracts up to 20 matched skills from description text using the curated 120-term taxonomy.
 */
export function extractSkillsDeterministically(text: string): string[] {
  if (!text) return [];
  const matched: string[] = [];
  for (const { name, pattern } of SKILLS_TAXONOMY) {
    if (pattern.test(text)) {
      matched.push(name);
      if (matched.length >= 20) break;
    }
  }
  return matched;
}

/**
 * Classifies role seniority based on job title and text cues.
 */
export function classifySeniority(title: string, text?: string): string {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-op|apprentice)\b/i.test(t)) return 'Intern';
  if (/\b(vp|vice president|evp|svp)\b/i.test(t)) return 'VP';
  if (/\b(director|head of)\b/i.test(t)) return 'Director';
  if (/\b(principal|distinguished|fellow)\b/i.test(t)) return 'Principal';
  if (/\b(staff)\b/i.test(t)) return 'Staff';
  if (/\b(lead|team lead|tech lead)\b/i.test(t)) return 'Lead';
  if (/\b(sr\.?|senior)\b/i.test(t)) return 'Senior';
  if (/\b(jr\.?|junior|entry[\s-]level|associate)\b/i.test(t)) return 'Junior';

  if (text) {
    const textStart = text.slice(0, 500).toLowerCase();
    if (/\b(intern|internship)\b/i.test(textStart)) return 'Intern';
    if (/\b(director|head of)\b/i.test(textStart)) return 'Director';
    if (/\b(staff engineer|staff designer|staff product)\b/i.test(textStart)) return 'Staff';
    if (/\b(principal engineer|principal designer)\b/i.test(textStart)) return 'Principal';
    if (/\b(senior|sr\.)\b/i.test(textStart)) return 'Senior';
    if (/\b(junior|jr\.|entry level)\b/i.test(textStart)) return 'Junior';
  }

  return 'Mid-level';
}

/**
 * Classifies department based on department hint, job title, and description text.
 */
export function classifyDepartment(departmentHint?: string | null, title?: string, text?: string): string {
  const combined = `${departmentHint || ''} ${title || ''}`.toLowerCase();

  if (
    /\b(data (science|scientist|engineer|engineering|analyst|analytics)|analytics|machine learning|deep learning|ai engineer|business intelligence|\bbi\b)\b/i.test(
      combined
    )
  ) {
    return 'Data & Analytics';
  }

  if (/\b(designer|design|ui[\/-]?ux|ux[\/-]?ui|ux design|ui design|user experience|visual design|graphic design|art director)\b/i.test(combined)) {
    return 'Design';
  }

  if (
    /\b(product manager|product management|product owner|technical product|group product|cpo)\b/i.test(combined) ||
    (/^product\b/i.test(departmentHint?.trim() || '') && !/\bdesign\b/i.test(combined))
  ) {
    return 'Product';
  }

  if (/\b(sales|account executive|business development|\bbdr\b|\bsdr\b|account manager|revenue)\b/i.test(combined)) {
    return 'Sales';
  }

  if (/\b(marketing|growth|content marketing|copywriter|\bseo\b|\bsem\b|brand marketing|demand generation|public relations|\bpr\b)\b/i.test(combined)) {
    return 'Marketing';
  }

  if (
    /\b(software engineer|engineering|developer|frontend|backend|full[\s-]?stack|devops|sre|site reliability|qa|quality assurance|cloud engineer|systems engineer|mobile engineer|android developer|ios developer|firmware|architect|infrastructure)\b/i.test(
      combined
    ) ||
    /^(engineering|r&d|tech|technology)$/i.test(departmentHint?.trim() || '')
  ) {
    return 'Engineering';
  }

  if (
    /\b(operations|people operations|human resources|\bhr\b|talent acquisition|recruiting|recruiter|finance|accounting|legal|compliance|procurement)\b/i.test(
      combined
    ) ||
    /^(operations|people|hr|talent|finance|legal)$/i.test(departmentHint?.trim() || '')
  ) {
    return 'Operations';
  }

  if (text) {
    const textPrefix = text.slice(0, 800).toLowerCase();
    if (/\b(data science|data engineer|machine learning)\b/i.test(textPrefix)) return 'Data & Analytics';
    if (/\b(product manager|product management)\b/i.test(textPrefix)) return 'Product';
    if (/\b(product design|ux design|ui design)\b/i.test(textPrefix)) return 'Design';
    if (/\b(sales|account executive)\b/i.test(textPrefix)) return 'Sales';
    if (/\b(marketing|growth)\b/i.test(textPrefix)) return 'Marketing';
    if (/\b(software engineer|developer|frontend|backend)\b/i.test(textPrefix)) return 'Engineering';
  }

  return 'Engineering';
}

/**
 * Extracts a clean 3-4 sentence summary of the role, skipping boilerplate company intros.
 */
export function extractCleanSummary(text: string, maxChars = 450): string {
  if (!text) return '';

  const clean = text.replace(/\s+/g, ' ').trim();
  let content = clean;

  // Jump past generic "About Us" / "Who We Are" preamble if explicit role marker exists
  const roleMarker = content.match(
    /(?:about the (?:role|job|position)|the opportunity|role (?:overview|summary)|position overview|what you['’]ll do|in this role|we are looking for)[:.]?\s*/i
  );
  if (roleMarker && roleMarker.index !== undefined && roleMarker.index < 1200) {
    content = content.slice(roleMarker.index + roleMarker[0].length);
  } else {
    // Strip opening "About [Company]" / "Who We Are" header up to the first substantive paragraph
    content = content.replace(
      /^(?:about (?:us|our company|[a-z0-9\s]+)|who we are|company overview|our mission)[:.]?\s+[^.!?]+[.!?]+\s*/i,
      ''
    );
  }

  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  const substantive = sentences
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && !/^(about us|who we are|what we offer|benefits|qualifications|requirements)[:.]?$/i.test(s));

  if (substantive.length === 0) {
    const rawCut = clean.slice(0, maxChars);
    return rawCut.length < clean.length ? rawCut.trim() + '...' : rawCut;
  }

  // Take 3-4 sentences up to maxChars
  let summary = '';
  for (let i = 0; i < Math.min(4, substantive.length); i++) {
    const cand = summary ? `${summary} ${substantive[i]}` : substantive[i];
    if (cand.length > maxChars) {
      if (!summary) {
        summary = cand.slice(0, maxChars - 3).trim() + '...';
      }
      break;
    }
    summary = cand;
  }

  return summary.trim() || clean.slice(0, maxChars);
}

/**
 * Normalizes employment type strings into standard values.
 */
function normalizeEmploymentType(raw?: string | null): string {
  if (!raw) return 'Full-time';
  const val = raw.toLowerCase().trim();
  if (/part[\s-]?time/i.test(val)) return 'Part-time';
  if (/contract|temp|temporary/i.test(val)) return 'Contract';
  if (/intern|internship|co-op/i.test(val)) return 'Internship';
  if (/full[\s-]?time|regular|permanent/i.test(val)) return 'Full-time';
  return raw.trim() || 'Full-time';
}

/**
 * Tier 1.5 & Tier 2.5 Strict Fast-Path Normalizer.
 * Returns ExtractedJobAttributes when structured input satisfies high-confidence gates,
 * or null if any gate condition fails (triggering Gemini Tier 3 fallback).
 */
export function tryFastPathNormalize(input: FastPathInput): ExtractedJobAttributes | null {
  // Gate 1: Company must be non-empty and non-placeholder
  const company = (input.company || '').trim();
  if (!company || COMPANY_PLACEHOLDERS.test(company)) {
    return null;
  }

  // Gate 2: Job title must be non-empty and non-placeholder
  const rawJobTitle = (input.jobTitle || '').trim();
  if (!rawJobTitle || TITLE_PLACEHOLDERS.test(rawJobTitle)) {
    return null;
  }

  // Gate 3: Location must be non-empty and non-placeholder
  const location = (input.location || '').trim();
  if (!location || LOCATION_PLACEHOLDERS.test(location)) {
    return null;
  }

  // Gate 4: Cleaned description text must be >= 200 characters
  let cleanedDescription = '';
  if (input.descriptionText && input.descriptionText.trim().length > 0) {
    cleanedDescription = cleanHtmlDescription(decodeHtmlEntities(input.descriptionText)).replace(/\s+/g, ' ').trim();
  } else if (input.descriptionHtml && input.descriptionHtml.trim().length > 0) {
    cleanedDescription = cleanHtmlDescription(decodeHtmlEntities(input.descriptionHtml)).replace(/\s+/g, ' ').trim();
  }

  if (cleanedDescription.length < 200) {
    return null;
  }

  // Deterministic Enrichment:
  // 1. Title & Team splitting
  const parsedRoleTeam = parseJobTitleAndTeam(rawJobTitle, input.team || undefined);

  // 2. Skill taxonomy extraction (120+ terms)
  const requiredSkills = extractSkillsDeterministically(cleanedDescription);

  // 3. Seniority classification
  const seniority = classifySeniority(parsedRoleTeam.jobTitle, cleanedDescription);

  // 4. Department classification
  const department = classifyDepartment(input.department, parsedRoleTeam.jobTitle, cleanedDescription);

  // 5. Executive summary extraction (max 450 chars)
  const summary = extractCleanSummary(cleanedDescription, 450);

  // 6. Salary normalization
  let salary = input.salary;
  let salaryMin = input.salaryMin ?? null;
  let salaryMax = input.salaryMax ?? null;

  if (!salary || salary === 'Not listed') {
    const rawToSearch = cleanedDescription + (input.rawPayload ? ` ${JSON.stringify(input.rawPayload)}` : '');
    const parsedSalary = extractSalaryFromTextOrJson(rawToSearch);
    if (parsedSalary.salary !== 'Not listed') {
      salary = parsedSalary.salary;
      salaryMin = parsedSalary.salaryMin;
      salaryMax = parsedSalary.salaryMax;
    } else {
      salary = 'Not listed (ATS API)';
      salaryMin = null;
      salaryMax = null;
    }
  }

  const employmentType = normalizeEmploymentType(input.employmentType);

  return {
    company,
    jobTitle: parsedRoleTeam.jobTitle,
    team: parsedRoleTeam.team || input.team || undefined,
    location,
    salary,
    salaryMin,
    salaryMax,
    industry: 'Unknown',
    summary,
    companyMetadata: { ...UNKNOWN_COMPANY_METADATA },
    positionMetadata: {
      seniority,
      department,
      employmentType,
      requiredSkills,
      team: parsedRoleTeam.team || input.team || undefined,
    },
  };
}
