import { describe, expect, it } from 'vitest';
import {
  classifyDepartment,
  classifySeniority,
  extractCleanSummary,
  extractSkillsDeterministically,
  FastPathInput,
  tryFastPathNormalize,
} from '../fastPathNormalizer.ts';

const SAMPLE_DESCRIPTION = `
About Us: Acme Corp is a global leader in cloud software infrastructure. We build high-throughput systems used by millions of developers worldwide.
About the Role: We are seeking a Staff Backend Engineer to design and scale our mission-critical data pipelines.
In this role, you will lead the architecture of distributed systems, collaborate with cross-functional teams, and mentor junior engineers.
You will write clean, well-tested code in Go and TypeScript, orchestrating microservices on Kubernetes and AWS.
Requirements:
- 7+ years of experience with distributed systems and microservices.
- Strong proficiency in Go, Python, or TypeScript.
- Deep hands-on experience with PostgreSQL, Redis, Kafka, and Docker.
- Experience with GraphQL APIs and CI/CD automation using GitHub Actions.
- Compensation: $185,000 - $225,000 USD per year.
`;

describe('fastPathNormalizer', () => {
  describe('Gate Requirements', () => {
    const validBase: FastPathInput = {
      company: 'Datadog',
      jobTitle: 'Senior Software Engineer',
      location: 'New York, NY',
      descriptionText: SAMPLE_DESCRIPTION,
    };

    it('returns ExtractedJobAttributes when all gate conditions are satisfied', () => {
      const result = tryFastPathNormalize(validBase);
      expect(result).not.toBeNull();
      expect(result?.company).toBe('Datadog');
      expect(result?.jobTitle).toBe('Senior Software Engineer');
      expect(result?.location).toBe('New York, NY');
      expect(result?.positionMetadata.seniority).toBe('Senior');
      expect(result?.positionMetadata.department).toBe('Engineering');
    });

    it('rejects empty or whitespace company', () => {
      expect(tryFastPathNormalize({ ...validBase, company: '' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, company: '   ' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, company: null })).toBeNull();
    });

    it('rejects placeholder company names', () => {
      const placeholders = [
        'Company',
        'Direct Applicant Posting',
        'Direct Applicant',
        'Unknown',
        'Unknown Company',
        'Confidential',
        'Hiring Organization',
        'Employer',
      ];
      for (const p of placeholders) {
        expect(tryFastPathNormalize({ ...validBase, company: p })).toBeNull();
        expect(tryFastPathNormalize({ ...validBase, company: p.toLowerCase() })).toBeNull();
      }
    });

    it('rejects empty or whitespace jobTitle', () => {
      expect(tryFastPathNormalize({ ...validBase, jobTitle: '' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, jobTitle: '   ' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, jobTitle: null })).toBeNull();
    });

    it('rejects placeholder job titles', () => {
      const placeholders = [
        'Unknown Role',
        'Role',
        'Job Opening',
        'Job Title',
        'Position',
        'Open Position',
        'Career Opportunity',
        'Untitled',
      ];
      for (const p of placeholders) {
        expect(tryFastPathNormalize({ ...validBase, jobTitle: p })).toBeNull();
      }
    });

    it('rejects empty or placeholder locations', () => {
      expect(tryFastPathNormalize({ ...validBase, location: '' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, location: '   ' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, location: 'Unknown' })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, location: 'Not listed' })).toBeNull();
    });

    it('rejects descriptions shorter than 200 cleaned characters', () => {
      const shortDesc = 'This is a short job description that has fewer than two hundred characters in total length.';
      expect(tryFastPathNormalize({ ...validBase, descriptionText: shortDesc })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, descriptionText: undefined, descriptionHtml: `<p>${shortDesc}</p>` })).toBeNull();
      expect(tryFastPathNormalize({ ...validBase, descriptionText: '', descriptionHtml: '' })).toBeNull();
    });
  });

  describe('Deterministic Title and Team Splitting', () => {
    it('splits "Title - Team" format', () => {
      const result = tryFastPathNormalize({
        company: 'Stripe',
        jobTitle: 'Staff Software Engineer - Billing Platform',
        location: 'Remote',
        descriptionText: SAMPLE_DESCRIPTION,
      });
      expect(result?.jobTitle).toBe('Staff Software Engineer');
      expect(result?.team).toBe('Billing Platform');
      expect(result?.positionMetadata.team).toBe('Billing Platform');
    });

    it('splits "Title – Team" (en-dash) format', () => {
      const result = tryFastPathNormalize({
        company: 'Figma',
        jobTitle: 'Product Designer – Design Systems',
        location: 'San Francisco, CA',
        descriptionText: SAMPLE_DESCRIPTION,
      });
      expect(result?.jobTitle).toBe('Product Designer');
      expect(result?.team).toBe('Design Systems');
    });

    it('uses input.team if provided explicitly', () => {
      const result = tryFastPathNormalize({
        company: 'Notion',
        jobTitle: 'Senior Infrastructure Engineer',
        team: 'Core Infra',
        location: 'San Francisco, CA',
        descriptionText: SAMPLE_DESCRIPTION,
      });
      expect(result?.jobTitle).toBe('Senior Infrastructure Engineer');
      expect(result?.team).toBe('Core Infra');
    });
  });

  describe('Skill Taxonomy Extraction (120+ terms)', () => {
    it('extracts technical skills accurately from description text', () => {
      const text = `
        We are building a Next.js and React frontend with Tailwind CSS and TypeScript.
        Our backend services run on Node.js and Go, backed by PostgreSQL, Redis, and Kafka.
        Infrastructure is deployed to AWS with Kubernetes, Docker, and Terraform via GitHub Actions CI/CD.
        Knowledge of GraphQL, REST APIs, and Python is a plus.
      `;
      const skills = extractSkillsDeterministically(text);
      expect(skills).toContain('TypeScript');
      expect(skills).toContain('React');
      expect(skills).toContain('Next.js');
      expect(skills).toContain('Tailwind CSS');
      expect(skills).toContain('Go');
      expect(skills).toContain('Node.js');
      expect(skills).toContain('PostgreSQL');
      expect(skills).toContain('Redis');
      expect(skills).toContain('Kafka');
      expect(skills).toContain('AWS');
      expect(skills).toContain('Kubernetes');
      expect(skills).toContain('Docker');
      expect(skills).toContain('Terraform');
      expect(skills).toContain('GitHub Actions');
      expect(skills).toContain('GraphQL');
      expect(skills).toContain('REST APIs');
      expect(skills).toContain('Python');
    });

    it('does not falsely match substring words', () => {
      const text = 'We go to market with good solutions for everyday java-lovers.';
      const skills = extractSkillsDeterministically(text);
      // "go" in lowercase should not trigger Golang/Go
      expect(skills).not.toContain('Go');
      // "java-lovers" has "java", but should not trigger JavaScript
      expect(skills).not.toContain('JavaScript');
    });
  });

  describe('Seniority Classification', () => {
    it('classifies standard seniority levels from job titles', () => {
      expect(classifySeniority('Software Engineering Intern')).toBe('Intern');
      expect(classifySeniority('Junior Frontend Engineer')).toBe('Junior');
      expect(classifySeniority('Software Engineer')).toBe('Mid-level');
      expect(classifySeniority('Senior Fullstack Engineer')).toBe('Senior');
      expect(classifySeniority('Sr. Backend Developer')).toBe('Senior');
      expect(classifySeniority('Lead Systems Engineer')).toBe('Lead');
      expect(classifySeniority('Staff Data Engineer')).toBe('Staff');
      expect(classifySeniority('Principal Software Architect')).toBe('Principal');
      expect(classifySeniority('Director of Engineering')).toBe('Director');
      expect(classifySeniority('VP of Product')).toBe('VP');
    });
  });

  describe('Department Classification', () => {
    it('classifies standard departments accurately', () => {
      expect(classifyDepartment('Engineering', 'Backend Engineer')).toBe('Engineering');
      expect(classifyDepartment(undefined, 'Product Manager')).toBe('Product');
      expect(classifyDepartment(undefined, 'Senior UX Designer')).toBe('Design');
      expect(classifyDepartment(undefined, 'Product Designer')).toBe('Design');
      expect(classifyDepartment(undefined, 'Data Scientist')).toBe('Data & Analytics');
      expect(classifyDepartment(undefined, 'Account Executive')).toBe('Sales');
      expect(classifyDepartment(undefined, 'Growth Marketing Lead')).toBe('Marketing');
      expect(classifyDepartment(undefined, 'Talent Acquisition Partner')).toBe('Operations');
    });
  });

  describe('Clean Summary Extraction', () => {
    it('skips generic "About Us" boilerplate and extracts role description', () => {
      const summary = extractCleanSummary(SAMPLE_DESCRIPTION, 450);
      expect(summary).not.toContain('Acme Corp is a global leader');
      expect(summary).toContain('Staff Backend Engineer');
      expect(summary.length).toBeLessThanOrEqual(450);
    });
  });

  describe('Salary Normalization', () => {
    it('extracts and formats salary range from description text', () => {
      const result = tryFastPathNormalize({
        company: 'Vercel',
        jobTitle: 'Senior Frontend Engineer',
        location: 'Remote',
        descriptionText: SAMPLE_DESCRIPTION,
      });
      expect(result?.salary).toBe('185k - 225k');
      expect(result?.salaryMin).toBe(185000);
      expect(result?.salaryMax).toBe(225000);
    });

    it('preserves pre-parsed structured salary if provided in input', () => {
      const result = tryFastPathNormalize({
        company: 'Vercel',
        jobTitle: 'Senior Frontend Engineer',
        location: 'Remote',
        salary: '$200k - $240k',
        salaryMin: 200000,
        salaryMax: 240000,
        descriptionText: SAMPLE_DESCRIPTION,
      });
      expect(result?.salary).toBe('$200k - $240k');
      expect(result?.salaryMin).toBe(200000);
      expect(result?.salaryMax).toBe(240000);
    });
  });
});
