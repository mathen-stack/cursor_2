import type { UserProfile } from "@resume/contracts";

/**
 * Permanent regression fixture: Software Mind Senior Frontend Engineer JD
 * with HP → Visa → Plutora career chronology.
 *
 * Source shape mirrors Software Mind [VKS] Front-end Software Engineer (React)
 * listings (React.js, Next.js, TypeScript, Tailwind CSS, CSS Modules, DaisyUI,
 * RESTful APIs, WebSockets, TDD/Vitest/Cypress, Git/Jira/Confluence), titled
 * as Senior Frontend Engineer for ATS target-role progression.
 */
export const SOFTWARE_MIND_SENIOR_FRONTEND_JD = `Senior Frontend Engineer

Company Description
Software Mind develops solutions that make an impact for companies around the globe. Tech giants & unicorns, transformative projects, emerging technologies and limitless opportunities – these are a few words that describe an average day for us. Building cross-functional engineering teams that take ownership and crave more means we’re always on the lookout for talented people who bring passion and creativity to every project. Our culture embraces openness, acts with respect, shows grit & guts and combines employment with enjoyment.

Job Description
Project – the aim you’ll have
This project focuses on developing and maintaining gaming applications with a strong emphasis on player protection and responsible gaming. The team builds reliable, secure, and scalable front-end experiences that help players stay informed and keep gameplay fair. Engineers collaborate closely across product, design, and backend partners to deliver polished user interfaces and real-time features.

Position – how you’ll contribute
- Develop and maintain front-end applications using React.js and Next.js
- Implement user interfaces with Tailwind CSS, CSS Modules, and component libraries such as DaisyUI
- Ensure type safety and robust code with TypeScript
- Integrate with RESTful APIs for data exchange
- Implement real-time communication features using WebSockets
- Write unit and end-to-end tests using Vitest and Cypress following Test-Driven Development (TDD)
- Collaborate with cross-functional engineering teams on architecture, delivery, and quality
- Optimize performance and enhance game features for production reliability
- Document technical decisions and share knowledge using Confluence
- Track delivery work and collaborate on sprint planning in Jira
- Use Git for version control, code review, and release readiness

Expectations – the experience you need
- React.js (4+ years): Understanding of React.js fundamentals, including component life-cycles, hooks, state management strategies, and performance optimizations
- Next.js: Hands-on experience with server-side rendering, API routes, authentication strategies, and performance tuning
- Proficient with Tailwind CSS, CSS Modules, and component libraries such as DaisyUI or similar UI libraries
- TypeScript: Strong knowledge of TypeScript, including custom types, generics, utility types, and type safety best practices
- Experience working with RESTful APIs - building, securing, and optimizing for performance
- Familiarity with real-time communication via native WebSocket APIs or third-party libraries
- Practical experience with Test-Driven Development (TDD) using tools like Vitest and Cypress for unit and end-to-end testing
- Comfortable working with modern development tools such as Git, Jira, and Confluence

Soft Skills
- Strong verbal and written communication skills in English, with the ability to clearly explain technical concepts and collaborate effectively within a team
- Excellent collaboration with both technical and non-technical stakeholders

Additional Information
Position at: Software Mind
`;

export const SOFTWARE_MIND_REQUIRED_SKILLS = [
  "React.js",
  "Next.js",
  "TypeScript",
  "Tailwind CSS",
  "CSS Modules",
  "DaisyUI",
  "RESTful APIs",
  "WebSockets",
  "Test-Driven Development",
  "Vitest",
  "Cypress",
  "Git",
  "Jira",
  "Confluence",
] as const;

export const SOFTWARE_MIND_EXPECTED_ROLE_PROGRESSION = [
  "Senior Frontend Engineer",
  "Frontend Engineer",
  "Software Engineer",
] as const;

export function softwareMindCareerProfile(profileId: string): UserProfile {
  return {
    profileId,
    personalInformation: {
      fullName: "Alex Morgan",
      email: "alex.morgan@example.com",
      phone: "+1 555 0142",
      location: "Remote",
      linkedin: "https://www.linkedin.com/in/alex-morgan",
    },
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: "HP",
        startDate: "2022-03",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Visa",
        startDate: "2019-06",
        endDate: "2022-02",
      },
      {
        experienceId: "EXP-003",
        companyName: "Plutora",
        startDate: "2016-01",
        endDate: "2019-05",
      },
    ],
    education: [
      {
        educationId: "EDU-001",
        institution: "State University",
        degree: "Bachelor of Science",
        field: "Computer Science",
        graduationDate: "2015",
      },
    ],
  };
}
