<?php
namespace App\Controller;
use App\Service\UserServiceInterface;
class UserController {
    public function __construct(
        private readonly UserServiceInterface $userService,
    ) {}
    public function create(string $name, string $email): void {
        $this->userService->createUser($name, $email);
    }
}
