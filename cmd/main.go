package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		return
	}

	command := os.Args[1]
	switch command {
	case "server":
		runServer()
	case "add-api-key":
		addAPIKey()
	case "add-oauth":
		addOAuth()
	case "list-accounts":
		listAccounts()
	case "oauth-start":
		oauthStart()
	case "oauth-callback":
		oauthCallback()
	case "status":
		showStatus()
	default:
		fmt.Printf("Unknown command: %s\n", command)
		printUsage()
	}
}

func printUsage() {
	fmt.Println("LLM Gateway - Anthropic API Proxy")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  llm-gateway server                     # Start HTTP server")
	fmt.Println("  llm-gateway add-api-key --key=KEY      # Add API key account")
	fmt.Println("  llm-gateway add-oauth --client-id=ID   # Add OAuth account")
	fmt.Println("  llm-gateway list-accounts              # List all accounts")
	fmt.Println("  llm-gateway oauth-start --account-id=ID # Start OAuth flow")
	fmt.Println("  llm-gateway oauth-callback --code=CODE # Complete OAuth")
	fmt.Println("  llm-gateway status                     # Show system status")
}

func runServer() {
	fmt.Println("Starting LLM Gateway server...")
	// TODO: Implement server startup
}

func addAPIKey() {
	fmt.Println("Adding API key account...")
	// TODO: Implement API key addition
}

func addOAuth() {
	fmt.Println("Adding OAuth account...")
	// TODO: Implement OAuth account addition
}

func listAccounts() {
	fmt.Println("Listing accounts...")
	// TODO: Implement account listing
}

func oauthStart() {
	fmt.Println("Starting OAuth flow...")
	// TODO: Implement OAuth start
}

func oauthCallback() {
	fmt.Println("Handling OAuth callback...")
	// TODO: Implement OAuth callback
}

func showStatus() {
	fmt.Println("System Status:")
	// TODO: Implement status display
}