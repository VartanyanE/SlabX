import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { authApi } from "./api/auth";

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
      />
    </label>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ user }) => {
      queryClient.setQueryData(["me"], user);
      navigate("/account");
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      email: String(data.get("email")),
      password: String(data.get("password")),
    });
  }
  return (
    <AuthLayout eyebrow="WELCOME BACK" title="Sign in to SlabX.">
      <form className="auth-form" onSubmit={submit}>
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        {mutation.error && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <button className="button button-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </button>
        <Link className="text-link" to="/forgot-password">
          Forgot your password?
        </Link>
        <a className="button button-secondary" href="/api/v1/auth/google/start">
          Continue with Google
        </a>
        <p className="form-footnote">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [complete, setComplete] = useState(false);
  const mutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => setComplete(true),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      email: String(data.get("email")),
      password: String(data.get("password")),
      handle: String(data.get("handle")),
      displayName: String(data.get("displayName")),
    });
  }
  if (complete)
    return (
      <AuthLayout
        eyebrow="CHECK YOUR EMAIL"
        title="Your collection starts here."
      >
        <p className="auth-lead">
          We sent a verification link to your email. Open it to activate your
          SlabX account.
        </p>
        <Link className="button button-secondary" to="/login">
          Return to sign in
        </Link>
      </AuthLayout>
    );
  return (
    <AuthLayout eyebrow="JOIN SLABX" title="Create your collector profile.">
      <form className="auth-form" onSubmit={submit}>
        <Field label="Display name" name="displayName" autoComplete="name" />
        <Field label="Collector handle" name="handle" autoComplete="username" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password (12+ characters)"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        {mutation.error && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <button className="button button-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating account…" : "Create account"}
        </button>
        <p className="form-footnote">
          Already a member? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const mutation = useMutation({ mutationFn: authApi.forgotPassword });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(String(new FormData(event.currentTarget).get("email")));
  }
  return (
    <AuthLayout eyebrow="ACCOUNT RECOVERY" title="Reset your password.">
      {mutation.isSuccess ? (
        <p className="auth-lead">
          If an account matches that email, we sent a password reset link.
        </p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <button
            className="button button-primary"
            disabled={mutation.isPending}
          >
            Send reset link
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const mutation = useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
  });
  const token = params.get("token") ?? "";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({
      token,
      password: String(new FormData(event.currentTarget).get("password")),
    });
  }
  return (
    <AuthLayout eyebrow="ACCOUNT RECOVERY" title="Choose a new password.">
      {mutation.isSuccess ? (
        <p className="auth-lead">
          Your password is updated. <Link to="/login">Sign in</Link>.
        </p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <Field
            label="New password (12+ characters)"
            name="password"
            type="password"
            autoComplete="new-password"
          />
          {(!token || mutation.error) && (
            <p className="form-error" role="alert">
              {mutation.error?.message ?? "This reset link is invalid."}
            </p>
          )}
          <button
            className="button button-primary"
            disabled={!token || mutation.isPending}
          >
            Update password
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const mutation = useMutation({ mutationFn: authApi.verifyEmail });
  const token = params.get("token") ?? "";
  const { isIdle, mutate } = mutation;
  useEffect(() => {
    if (token && isIdle) mutate(token);
  }, [token, isIdle, mutate]);
  return (
    <AuthLayout
      eyebrow="EMAIL VERIFICATION"
      title={mutation.isSuccess ? "Email verified." : "Verifying your email…"}
    >
      {mutation.isSuccess && (
        <Link className="button button-primary" to="/login">
          Continue to sign in
        </Link>
      )}
      {(!token || mutation.isError) && (
        <p className="form-error" role="alert">
          {mutation.error?.message ?? "This verification link is invalid."}
        </p>
      )}
    </AuthLayout>
  );
}

export function AccountPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  const profile = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (user) => queryClient.setQueryData(["me"], user),
  });
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });
  if (me.isLoading)
    return (
      <main id="main-content" className="account-page">
        <p>Loading account…</p>
      </main>
    );
  if (me.isError) return <Navigate to="/login" replace />;
  const user = me.data!;
  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    profile.mutate({
      displayName: String(data.get("displayName")),
      bio: String(data.get("bio")) || null,
    });
  }
  return (
    <main id="main-content" className="account-page">
      <div className="account-heading">
        <div>
          <p className="section-kicker">ACCOUNT</p>
          <h1>{user.profile.displayName}</h1>
          <p>
            @{user.profile.handle} ·{" "}
            {user.emailVerified ? "Verified" : "Verification pending"}
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => logout.mutate()}
        >
          Sign out
        </button>
      </div>
      <section className="account-card">
        <h2>Collector profile</h2>
        <form className="auth-form" onSubmit={saveProfile}>
          <Field
            label="Display name"
            name="displayName"
            defaultValue={user.profile.displayName}
          />
          <label className="form-field">
            <span>Bio</span>
            <textarea
              name="bio"
              defaultValue={user.profile.bio ?? ""}
              maxLength={500}
            />
          </label>
          {profile.error && (
            <p className="form-error">{profile.error.message}</p>
          )}
          <button
            className="button button-primary"
            disabled={profile.isPending}
          >
            Save profile
          </button>
        </form>
      </section>
      <AddressBook />
      <SessionList />
    </main>
  );
}

function SessionList() {
  const navigate = useNavigate();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: authApi.sessions,
  });
  const logoutAll = useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: () => navigate("/login"),
  });
  return (
    <section className="account-card">
      <h2>Active sessions</h2>
      <div className="address-list">
        {sessions.data?.map((session) => (
          <article key={session.id}>
            <strong>
              {session.current ? "This device" : "Signed-in device"}
            </strong>
            <p>Signed in {new Date(session.createdAt).toLocaleDateString()}</p>
          </article>
        ))}
      </div>
      <button
        className="button button-secondary"
        onClick={() => logoutAll.mutate()}
        disabled={logoutAll.isPending}
      >
        Sign out everywhere
      </button>
    </section>
  );
}

function AddressBook() {
  const queryClient = useQueryClient();
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: authApi.addresses,
  });
  const create = useMutation({
    mutationFn: authApi.createAddress,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
  const remove = useMutation({
    mutationFn: authApi.deleteAddress,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      label: String(data.get("label")),
      recipientName: String(data.get("recipientName")),
      line1: String(data.get("line1")),
      line2: String(data.get("line2")) || null,
      city: String(data.get("city")),
      region: String(data.get("region")),
      postalCode: String(data.get("postalCode")),
      countryCode: "US",
      isDefaultShipping: Boolean(data.get("default")),
    });
    event.currentTarget.reset();
  }
  return (
    <section className="account-card">
      <h2>Shipping addresses</h2>
      <div className="address-list">
        {addresses.data?.map((address) => (
          <article key={address.id}>
            <strong>{address.label}</strong>
            <p>
              {address.recipientName}
              <br />
              {address.line1}
              <br />
              {address.city}, {address.region} {address.postalCode}
            </p>
            {address.isDefaultShipping && <span>Default</span>}
            <button
              className="text-link"
              type="button"
              onClick={() => remove.mutate(address.id)}
            >
              Remove
            </button>
          </article>
        ))}
        {addresses.data?.length === 0 && <p>No saved addresses yet.</p>}
      </div>
      <details>
        <summary>Add an address</summary>
        <form className="auth-form compact-form" onSubmit={submit}>
          <Field label="Label" name="label" />
          <Field label="Recipient" name="recipientName" />
          <Field label="Street address" name="line1" />
          <Field label="Apartment or unit" name="line2" required={false} />
          <Field label="City" name="city" />
          <Field label="State" name="region" />
          <Field label="ZIP code" name="postalCode" />
          <label className="check-field">
            <input type="checkbox" name="default" /> Make this my default
          </label>
          <button className="button button-primary">Save address</button>
        </form>
      </details>
    </section>
  );
}

function AuthLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="auth-page">
      <section>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="auth-lead">
          A secure home for your collection, marketplace activity, and collector
          reputation.
        </p>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  );
}
