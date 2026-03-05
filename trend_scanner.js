import fs from "fs";

const ideas = [
"invoice generator for freelancers",
"adhd focus timer",
"simple flight tracker map",
"minimal daily budget planner",
"youtube title generator",
"random workout generator",
"habit tracker web app",
"markdown note editor",
"password generator tool",
"simple project planner",
"pomodoro focus tool",
"weekly meal planner",
"startup idea generator",
"seo keyword generator",
"daily writing prompt generator",
"simple todo list app",
"link organizer tool",
"reading tracker web app",
"study timer for students",
"simple calendar planner"
];

fs.writeFileSync(
"./ideas.json",
JSON.stringify(ideas, null, 2)
);

console.log("ideas.json created");