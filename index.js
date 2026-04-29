require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const fetch = require("node-fetch");
const cors = require("cors");
const Job = require("./models/Job");

const app = express();
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI, { dbName: "ai-agent" })
  .then(() => console.log("MongoDB connected!"))
  .catch((err) => console.error("MongoDB error:", err));

// ─── TOOLS — these are the actual functions the agent can call ────────────────

// Tool 1 — get candidate profile (hardcoded for now, in real app fetch from DB)
function get_profile() {
  console.log("🔧 Tool called: get_profile");
  return {
    name: "Hemalatha Maradana",
    title: "Front-End Developer",
    skills: [
      "Angular",
      "TypeScript",
      "JavaScript",
      "HTML5",
      "CSS3",
      "Bootstrap",
      "REST APIs",
      "Node.js",
      "MongoDB",
    ],
    experience: "1 year internship at Synycs Group Pvt Ltd",
    education: "B.Tech Computer Science",
  };
}

// Tool 2 — simulate job search (in real app, call a jobs API)
async function search_jobs({ skill }) {
  console.log(`🔧 Tool called: search_jobs (REAL API) — skill: ${skill}`);

  try {
    const response = await fetch(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(skill)}&limit=5`,
    );

    const data = await response.json();

    // Safety check
    if (!data.jobs || !Array.isArray(data.jobs)) {
      return [];
    }

    // ✅ THIS WAS MISSING
    return data.jobs.map((j) => ({
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location,
      skills: [skill],
      url: j.url,
    }));
  } catch (error) {
    console.error("❌ Job API error:", error);
    return [];
  }
}
// function search_jobs({ location, skill }) {
//   console.log(`🔧 Tool called: search_jobs — location: ${location}, skill: ${skill}`);

//   // Simulated job listings
//   const allJobs = [
//     { title: "Angular Developer", company: "TechCorp Hyderabad", location: "Hyderabad", skills: ["Angular", "TypeScript", "REST APIs"] },
//     { title: "Frontend Engineer", company: "Infosys", location: "Hyderabad", skills: ["Angular", "JavaScript", "HTML5", "CSS3"] },
//     { title: "React Developer", company: "Wipro", location: "Hyderabad", skills: ["React", "JavaScript", "CSS3"] },
//     { title: "Full Stack Developer", company: "StartupXYZ", location: "Hyderabad", skills: ["Angular", "Node.js", "MongoDB"] },
//     { title: "UI Developer", company: "HCL", location: "Bangalore", skills: ["HTML5", "CSS3", "JavaScript", "Bootstrap"] },
//     { title: "Angular Intern", company: "Cognizant", location: "Hyderabad", skills: ["Angular", "TypeScript", "Bootstrap"] },
//   ];

//   // Filter by location and skill
//   return allJobs.filter(job =>
//     job.location.toLowerCase().includes(location.toLowerCase()) &&
//     job.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
//   );
// }

// Tool 3 — save job to MongoDB
async function save_job({ title, company, location, skills, url }) {
  console.log(`🔧 Tool called: save_job — ${title} at ${company}`);

  const profile = get_profile();

  const matchScore = calculateMatchScore(skills, profile.skills);

  const job = await Job.create({
    title,
    company,
    location,
    skills,
    matchScore,
    url,
  });

  return {
    saved: true,
    id: job._id,
    matchScore,
    message: `Saved ${title} at ${company}`,
  };
}
// async function save_job({ title, company, location, skills, matchScore, url }) {
//   console.log(`🔧 Tool called: save_job — ${title} at ${company}`);

//   const job = await Job.create({
//     title,
//     company,
//     location,
//     skills,
//     matchScore,
//     url,
//   });
//   return { saved: true, id: job._id, message: `Saved ${title} at ${company}` };
// }

// ─── TOOL DEFINITIONS — what we tell the AI about our tools ──────────────────
const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "get_profile",
      description:
        "Get the candidate's resume profile including skills, experience and education",
      parameters: {
        type: "object",
        properties: {}, // no parameters needed
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_jobs",
      description: "Search for remote jobs using a skill keyword",
      parameters: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description: "Skill like Angular, React, Node.js",
          },
        },
        required: ["skill"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_job",
      description: "Save a relevant job to the database",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          matchScore: {
            type: "number",
            // description: "Match score 0-100 based on candidate skills",
          },
          url: { type: "string" },
        },
        required: ["title", "company", "location", "skills", "url"],
      },
    },
  },
];

// ─── TOOL EXECUTOR — runs the actual function when AI requests it ─────────────
async function executeTool(toolName, toolArgs) {
  switch (toolName) {
    case "get_profile":
      return get_profile();
    case "search_jobs":
      return search_jobs(toolArgs);
    case "save_job":
      return await save_job(toolArgs);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

function calculateMatchScore(jobSkills, candidateSkills) {
  let score = 0;

  jobSkills.forEach((js) => {
    if (candidateSkills.some((cs) => cs.toLowerCase() === js.toLowerCase())) {
      score += 20;
    }
  });

  return Math.min(score, 100);
}
// ─── AGENT ROUTE — the main agent loop ───────────────────────────────────────
app.post("/agent", async (req, res) => {
  const { userMessage } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: "Please send a userMessage" });
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`User: ${userMessage}`);
  console.log("=".repeat(50));

  // Start conversation
  const messages = [
    {
      role: "system",
      content: `You are a job search agent. You help candidates find relevant jobs.
When asked to find jobs:
1. First get the candidate profile using get_profile
2. Search for jobs using search_jobs
3. Filter results — ONLY consider jobs that are actual software/tech roles
   Ignore: content reviewers, crypto traders, writers, customer service, office roles
4. Calculate match score 0-100 based on skill overlap with candidate profile
   Only save jobs with matchScore >= 60
5. Save ONLY the relevant tech jobs using save_job
6. Summarize what you found and saved`,
    },
    { role: "user", content: userMessage },
  ];

  const steps = []; // track what agent did — for response
  let finalAnswer = "";

  // ─── AGENT LOOP — keeps running until AI stops calling tools ───────────────
  while (true) {
    console.log(`\n📤 Calling AI (message count: ${messages.length})`);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          messages,
          tools: toolDefinitions,
          tool_choice: "auto", // AI decides when to use tools
        }),
      },
    );

    const data = await response.json();

    console.log("AI RAW RESPONSE:", JSON.stringify(data, null, 2));

    // SAFETY CHECK
    if (!data.choices || !data.choices[0]) {
      console.error("❌ Invalid AI response:", data);

      return res.status(500).json({
        error: "AI response failed",
        details: data,
      });
    }

    const choice = data.choices[0];

    console.log(`📥 AI response — finish_reason: ${choice.finish_reason}`);

    // Add AI response to message history
    messages.push(choice.message);

    // If AI is done calling tools — we have final answer
    if (choice.finish_reason === "stop") {
      finalAnswer = choice.message.content;
      console.log("\n✅ Agent finished!");
      break;
    }

    // If AI wants to call tools
    if (choice.finish_reason === "tool_calls") {
      const toolCalls = choice.message.tool_calls;

      // Execute each tool the AI requested
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n⚡ Executing tool: ${toolName}`);
        console.log(`   Args:`, toolArgs);

        // Actually run the tool
        const toolResult = await executeTool(toolName, toolArgs);

        if (toolResult === undefined) {
          console.log("⚠️ Tool returned undefined!");
        } else {
          console.log(
            `   Result:`,
            JSON.stringify(toolResult).substring(0, 100),
          );
        }

        steps.push({
          tool: toolName,
          args: toolArgs,
          result: toolResult,
        });

        // Add tool result to messages so AI can see what happened
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
      // Loop continues — AI will decide next step
    }
  }

  res.json({
    userMessage,
    steps, // what tools were called and in what order
    finalAnswer, // AI's final summary
  });
});

// Get saved jobs
app.get("/jobs", async (req, res) => {
  const jobs = await Job.find().sort({ savedAt: -1 });
  res.json({ jobs });
});

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
  console.log(`Agent running on port ${PORT}`);
});
