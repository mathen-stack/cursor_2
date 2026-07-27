import type { AchievementDimension } from "../types/bullet-plan";
import type { StarMetricDirection, StarMetricType } from "../types/star-story";

export interface StarDimensionProfile {
  situationProblem: string;
  taskOwnership: string;
  actionMethod: string;
  technicalImpact: string;
  businessImpact: string;
  /**
   * Alternate business-impact endings so the same achievement dimension can be
   * reused across roles without cloning the visible closing phrase.
   */
  businessImpactAlternates: readonly string[];
  metricProfiles: readonly StarMetricProfile[];
}

export interface StarMetricProfile {
  metricType: StarMetricType;
  direction: StarMetricDirection;
  unit: "%" | "ms" | "x" | "hours" | "days";
  minimum: number;
  maximum: number;
  label: string;
}

export const STAR_DIMENSION_PROFILES: Readonly<
  Record<AchievementDimension, StarDimensionProfile>
> = {
  "architecture-design": {
    situationProblem:
      "fragmented architecture and inconsistent design patterns constrained scale and maintainability",
    taskOwnership:
      "define a resilient architecture that could support growth without increasing operational complexity",
    actionMethod:
      "establishing clear service boundaries, design standards, and production-ready integration patterns",
    technicalImpact: "improved architectural consistency and scalable system behavior",
    businessImpact: "enabled faster delivery of new capabilities with lower implementation risk",
    businessImpactAlternates: [
      "enabled faster delivery of new capabilities with lower implementation risk",
      "unlocked safer product expansion through clearer system boundaries",
      "reduced redesign churn while accelerating capability rollout",
    ],
    metricProfiles: [
      { metricType: "scale", direction: "increase", unit: "x", minimum: 2.1, maximum: 3.8, label: "supported workload scale" },
      { metricType: "delivery", direction: "decrease", unit: "%", minimum: 24, maximum: 42, label: "implementation cycle time" },
    ],
  },
  "production-delivery": {
    situationProblem:
      "manual and inconsistent release workflows delayed production delivery and increased deployment risk",
    taskOwnership:
      "create a repeatable production delivery process with clear release controls",
    actionMethod:
      "standardizing deployment automation, release gates, and operational handoffs",
    technicalImpact: "made releases faster, repeatable, and easier to recover",
    businessImpact: "shortened time to value for customer-facing improvements",
    businessImpactAlternates: [
      "shortened time to value for customer-facing improvements",
      "sped release readiness for customer-visible changes",
      "cutting the lag between finished work and production value",
    ],
    metricProfiles: [
      { metricType: "delivery", direction: "decrease", unit: "%", minimum: 31, maximum: 52, label: "deployment cycle time" },
      { metricType: "percentage", direction: "decrease", unit: "%", minimum: 22, maximum: 41, label: "release failures" },
    ],
  },
  "performance-optimization": {
    situationProblem:
      "performance bottlenecks limited responsiveness and reduced capacity during peak demand",
    taskOwnership:
      "remove the highest-impact bottlenecks while preserving correctness and reliability",
    actionMethod:
      "profiling critical paths, tuning resource use, and applying targeted runtime optimizations",
    technicalImpact: "improved runtime efficiency and response performance",
    businessImpact: "supported a faster user experience and more efficient infrastructure utilization",
    businessImpactAlternates: [
      "supported a faster user experience and more efficient infrastructure utilization",
      "improved responsiveness while containing compute waste",
      "raised capacity headroom without degrading user latency",
    ],
    metricProfiles: [
      { metricType: "latency", direction: "decrease", unit: "%", minimum: 27, maximum: 46, label: "latency" },
      { metricType: "throughput", direction: "increase", unit: "x", minimum: 1.7, maximum: 3.1, label: "throughput" },
    ],
  },
  "reliability-observability": {
    situationProblem:
      "limited production visibility made failures difficult to detect and diagnose before users were affected",
    taskOwnership:
      "establish proactive monitoring and operational controls for critical services",
    actionMethod:
      "implementing telemetry, alerting, service-level indicators, and incident feedback loops",
    technicalImpact: "increased service stability and shortened incident detection",
    businessImpact: "reduced customer disruption and operational risk",
    businessImpactAlternates: [
      "reduced customer disruption and operational risk",
      "limited outage blast radius before customers were affected",
      "improved recovery confidence during production incidents",
    ],
    metricProfiles: [
      { metricType: "availability", direction: "maintain", unit: "%", minimum: 99.9, maximum: 99.99, label: "service availability" },
      { metricType: "time", direction: "decrease", unit: "%", minimum: 34, maximum: 58, label: "incident detection time" },
    ],
  },
  "quality-automation": {
    situationProblem:
      "manual quality checks and repetitive engineering work created avoidable defects and delivery delays",
    taskOwnership:
      "automate critical controls and make quality measurable throughout delivery",
    actionMethod:
      "introducing automated validation, test coverage, and repeatable workflow orchestration",
    technicalImpact: "improved release quality and reduced manual intervention",
    businessImpact: "increased engineering capacity for higher-value work",
    businessImpactAlternates: [
      "increased engineering capacity for higher-value work",
      "freed engineers from repetitive validation overhead",
      "shifted effort toward higher-leverage product delivery",
    ],
    metricProfiles: [
      { metricType: "quality", direction: "decrease", unit: "%", minimum: 29, maximum: 49, label: "defect rate" },
      { metricType: "productivity", direction: "decrease", unit: "%", minimum: 32, maximum: 57, label: "manual effort" },
    ],
  },
  "scalability-capacity": {
    situationProblem:
      "rapid workload growth exposed capacity constraints and unstable behavior under peak traffic",
    taskOwnership:
      "expand system capacity while maintaining predictable performance",
    actionMethod:
      "applying horizontal scaling, workload partitioning, and capacity-aware resource controls",
    technicalImpact: "increased sustainable workload capacity",
    businessImpact: "supported growth without proportional infrastructure or support overhead",
    businessImpactAlternates: [
      "supported growth without proportional infrastructure or support overhead",
      "absorbed demand spikes without linear cost growth",
      "kept peak traffic stable while avoiding capacity thrash",
    ],
    metricProfiles: [
      { metricType: "scale", direction: "increase", unit: "x", minimum: 2.4, maximum: 4.2, label: "traffic capacity" },
      { metricType: "percentage", direction: "decrease", unit: "%", minimum: 22, maximum: 39, label: "peak-time errors" },
    ],
  },
  "cost-efficiency": {
    situationProblem:
      "resource consumption and cloud spend were increasing faster than delivered value",
    taskOwnership:
      "reduce operating cost without sacrificing performance or availability",
    actionMethod:
      "right-sizing workloads, eliminating idle capacity, and optimizing compute-intensive paths",
    technicalImpact: "improved resource efficiency across production workloads",
    businessImpact: "lowered recurring operating expense and improved unit economics",
    businessImpactAlternates: [
      "lowered recurring operating expense and improved unit economics",
      "trimmed idle spend while preserving service quality",
      "improved cost-to-serve for production workloads",
    ],
    metricProfiles: [
      { metricType: "cost", direction: "decrease", unit: "%", minimum: 18, maximum: 34, label: "infrastructure cost" },
      { metricType: "percentage", direction: "increase", unit: "%", minimum: 21, maximum: 38, label: "resource utilization" },
    ],
  },
  "security-governance": {
    situationProblem:
      "inconsistent controls created security, compliance, and operational governance risk",
    taskOwnership:
      "embed preventive controls into the engineering lifecycle",
    actionMethod:
      "implementing access controls, policy checks, auditability, and secure delivery practices",
    technicalImpact: "strengthened control coverage and reduced preventable security exposure",
    businessImpact: "lowered compliance risk and increased stakeholder confidence",
    businessImpactAlternates: [
      "lowered compliance risk and increased stakeholder confidence",
      "reduced audit exposure across delivery workflows",
      "strengthened trust in production control posture",
    ],
    metricProfiles: [
      { metricType: "percentage", direction: "decrease", unit: "%", minimum: 31, maximum: 54, label: "security findings" },
      { metricType: "quality", direction: "increase", unit: "%", minimum: 88, maximum: 98, label: "control coverage" },
    ],
  },
  "data-quality": {
    situationProblem:
      "inconsistent source data and weak validation reduced trust in downstream outputs",
    taskOwnership:
      "improve data integrity across ingestion, transformation, and consumption",
    actionMethod:
      "adding validation rules, lineage checks, anomaly detection, and recoverable processing",
    technicalImpact: "increased data accuracy and pipeline integrity",
    businessImpact: "improved confidence in analytics and operational decisions",
    businessImpactAlternates: [
      "improved confidence in analytics and operational decisions",
      "raised trust in downstream reporting outputs",
      "reduced decision risk caused by inconsistent data",
    ],
    metricProfiles: [
      { metricType: "quality", direction: "decrease", unit: "%", minimum: 28, maximum: 47, label: "data errors" },
      { metricType: "availability", direction: "maintain", unit: "%", minimum: 99.5, maximum: 99.95, label: "pipeline availability" },
    ],
  },
  "customer-business-impact": {
    situationProblem:
      "technical capabilities were not consistently translating into measurable customer or business value",
    taskOwnership:
      "connect engineering execution to a clear customer and business outcome",
    actionMethod:
      "prioritizing high-value use cases, defining success measures, and iterating from production feedback",
    technicalImpact: "focused technical delivery on measurable product outcomes",
    businessImpact: "increased adoption, customer value, and delivery effectiveness",
    businessImpactAlternates: [
      "increased adoption, customer value, and delivery effectiveness",
      "converted technical delivery into clearer customer outcomes",
      "improved product uptake through outcome-focused execution",
    ],
    metricProfiles: [
      { metricType: "percentage", direction: "increase", unit: "%", minimum: 16, maximum: 31, label: "feature adoption" },
      { metricType: "delivery", direction: "decrease", unit: "%", minimum: 20, maximum: 36, label: "time to value" },
      { metricType: "percentage", direction: "increase", unit: "%", minimum: 18, maximum: 34, label: "customer satisfaction" },
      { metricType: "percentage", direction: "increase", unit: "%", minimum: 15, maximum: 29, label: "product uptake" },
    ],
  },
  "cross-functional-alignment": {
    situationProblem:
      "misaligned technical and business expectations caused rework, unclear priorities, and delivery friction",
    taskOwnership:
      "align stakeholders on requirements, tradeoffs, ownership, and measurable success criteria",
    actionMethod:
      "facilitating cross-functional planning, translating business needs, and documenting technical decisions",
    technicalImpact: "improved requirement clarity and reduced avoidable implementation rework",
    businessImpact: "accelerated coordinated delivery across product and engineering stakeholders",
    businessImpactAlternates: [
      "accelerated coordinated delivery across product and engineering stakeholders",
      "reduced handoff friction between product and engineering",
      "shortened alignment cycles for shared delivery goals",
    ],
    metricProfiles: [
      { metricType: "delivery", direction: "decrease", unit: "%", minimum: 22, maximum: 39, label: "delivery cycle time" },
      { metricType: "percentage", direction: "decrease", unit: "%", minimum: 24, maximum: 43, label: "requirements rework" },
      { metricType: "percentage", direction: "decrease", unit: "%", minimum: 18, maximum: 33, label: "decision turnaround time" },
      { metricType: "percentage", direction: "increase", unit: "%", minimum: 17, maximum: 31, label: "cross-team execution" },
    ],
  },
  "technical-leadership": {
    situationProblem:
      "distributed technical decisions created inconsistent priorities and slowed execution across teams",
    taskOwnership:
      "provide technical direction, decision clarity, and accountable delivery leadership",
    actionMethod:
      "setting technical strategy, leading design reviews, and coordinating execution across workstreams",
    technicalImpact: "increased engineering consistency and decision quality",
    businessImpact: "improved delivery predictability and team effectiveness",
    businessImpactAlternates: [
      "improved delivery predictability and team effectiveness",
      "stabilized execution quality across engineering workstreams",
      "clarified ownership so teams shipped with less churn",
    ],
    metricProfiles: [
      { metricType: "productivity", direction: "increase", unit: "%", minimum: 18, maximum: 33, label: "team delivery velocity" },
      { metricType: "delivery", direction: "decrease", unit: "%", minimum: 19, maximum: 35, label: "decision lead time" },
    ],
  },
  "mentoring-knowledge-sharing": {
    situationProblem:
      "knowledge concentration and inconsistent engineering practices slowed onboarding and increased delivery risk",
    taskOwnership:
      "raise team capability through repeatable coaching and shared engineering standards",
    actionMethod:
      "mentoring engineers, documenting patterns, and running targeted technical workshops",
    technicalImpact: "improved engineering consistency and independent problem solving",
    businessImpact: "shortened onboarding and expanded team delivery capacity",
    businessImpactAlternates: [
      "shortened onboarding and expanded team delivery capacity",
      "raised independent delivery capacity across the team",
      "reduced knowledge bottlenecks that slowed new contributors",
    ],
    metricProfiles: [
      { metricType: "time", direction: "decrease", unit: "%", minimum: 24, maximum: 41, label: "onboarding time" },
      { metricType: "productivity", direction: "increase", unit: "%", minimum: 17, maximum: 29, label: "independent delivery capacity" },
    ],
  },
  "implementation-integration": {
    situationProblem:
      "disconnected systems and manual handoffs limited end-to-end workflow reliability",
    taskOwnership:
      "integrate the required capabilities into a dependable production workflow",
    actionMethod:
      "connecting services, standardizing interfaces, and automating critical handoffs",
    technicalImpact: "improved end-to-end integration and workflow consistency",
    businessImpact: "reduced operational effort and accelerated reliable delivery",
    businessImpactAlternates: [
      "reduced operational effort and accelerated reliable delivery",
      "eliminated brittle handoffs in end-to-end workflows",
      "making integrated delivery paths faster and more dependable",
    ],
    metricProfiles: [
      { metricType: "productivity", direction: "decrease", unit: "%", minimum: 28, maximum: 49, label: "manual processing effort" },
      { metricType: "delivery", direction: "decrease", unit: "%", minimum: 23, maximum: 41, label: "workflow completion time" },
    ],
  },
};
