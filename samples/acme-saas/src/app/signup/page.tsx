import { completeSignup } from "./actions";

// Signup screen. Collects the essentials, picks a plan, and hands off to the
// server action that actually creates the account.
export default function SignupPage() {
  return (
    <main className="signup">
      <h1>Create your Acme workspace</h1>
      <form action={completeSignup} className="signup-form">
        <label>
          Work email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Workspace name
          <input name="workspace" type="text" required />
        </label>
        <label>
          Plan
          <select name="plan" defaultValue="team">
            <option value="solo">Solo</option>
            <option value="team">Team</option>
            <option value="business">Business</option>
          </select>
        </label>
        <button type="submit">Create workspace</button>
      </form>
    </main>
  );
}
